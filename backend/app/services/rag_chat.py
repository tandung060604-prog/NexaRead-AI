from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models.document import ContentBlock, Document, DocumentVersion, utc_now
from app.models.rag import ChatMessage, ChatSession, Citation
from app.services.rag_providers import (
    NO_ANSWER_TEXT,
    AnswerProvider,
    AnswerSource,
    EmbeddingProvider,
    RagProviderError,
)
from app.services.rag_retrieval import RetrievedSource, retrieve_document_sources

CITATION_PATTERN = re.compile(r"\[(S\d+)\]")
UNSAFE_QUESTION_PATTERNS = (
    re.compile(
        r"\b(reveal|show|print|leak)\b.{0,40}\b(system prompt|api key|secret|token)\b",
        re.I,
    ),
    re.compile(r"\b(read|access)\b.{0,30}\b(another|other user|other tenant)\b", re.I),
    re.compile(r"\b(execute|run)\b.{0,30}\b(code|command|tool|shell)\b", re.I),
    re.compile(r"\b(contact|call|send to)\b.{0,30}\b(external|service|website|email)\b", re.I),
)


class ChatResourceNotFoundError(RuntimeError):
    pass


class CitationValidationError(RuntimeError):
    pass


@dataclass(frozen=True)
class ChatResult:
    message: ChatMessage
    citations: list[Citation]


def is_unsafe_question(question: str) -> bool:
    return any(pattern.search(question) for pattern in UNSAFE_QUESTION_PATTERNS)


def validate_citation_labels(answer: str, sources: list[RetrievedSource]) -> list[RetrievedSource]:
    if answer.strip() == NO_ANSWER_TEXT:
        return []
    labels = list(dict.fromkeys(CITATION_PATTERN.findall(answer)))
    if not labels:
        raise CitationValidationError("Grounded answers must contain at least one citation")
    mapping = {source.label: source for source in sources}
    unknown = [label for label in labels if label not in mapping]
    if unknown:
        raise CitationValidationError("Answer contains an unknown citation label")
    return [mapping[label] for label in labels]


async def _owned_source_ids(
    session: AsyncSession,
    *,
    user_id: str,
    document_id: UUID,
    block_ids: set[UUID],
) -> set[UUID]:
    if not block_ids:
        return set()
    return set(
        (
            await session.scalars(
                select(ContentBlock.id)
                .join(
                    DocumentVersion,
                    DocumentVersion.id == ContentBlock.document_version_id,
                )
                .join(Document, Document.id == DocumentVersion.document_id)
                .where(
                    ContentBlock.id.in_(block_ids),
                    Document.id == document_id,
                    Document.owner_id == user_id,
                )
            )
        ).all()
    )


async def _resolve_session(
    session: AsyncSession,
    *,
    user_id: str,
    document_id: UUID,
    session_id: UUID | None,
    question: str,
) -> ChatSession:
    if session_id is not None:
        chat_session = await session.scalar(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.user_id == user_id,
                ChatSession.document_id == document_id,
            )
        )
        if chat_session is None:
            raise ChatResourceNotFoundError
        return chat_session
    chat_session = ChatSession(
        user_id=user_id,
        document_id=document_id,
        title=" ".join(question.split())[:80] or "Document chat",
    )
    session.add(chat_session)
    await session.flush()
    return chat_session


def _cost_microusd(prompt_tokens: int, completion_tokens: int) -> int:
    settings = get_settings()
    return round(
        prompt_tokens * settings.rag_input_cost_per_million
        + completion_tokens * settings.rag_output_cost_per_million
    )


async def run_document_chat(
    session: AsyncSession,
    *,
    user_id: str,
    document_id: UUID,
    question: str,
    embedding_provider: EmbeddingProvider,
    answer_provider: AnswerProvider,
    session_id: UUID | None = None,
    task: str = "question",
) -> ChatResult:
    started_at = time.perf_counter()
    chat_session = await _resolve_session(
        session,
        user_id=user_id,
        document_id=document_id,
        session_id=session_id,
        question=question,
    )
    session.add(
        ChatMessage(
            chat_session_id=chat_session.id,
            role="user",
            content=question,
            status="COMPLETED",
        )
    )
    await session.flush()

    status = "COMPLETED"
    answer_text = NO_ANSWER_TEXT
    model: str | None = None
    prompt_tokens = 0
    completion_tokens = 0
    selected_sources: list[RetrievedSource] = []

    if is_unsafe_question(question):
        status = "GUARDRAIL_REFUSAL"
    else:
        try:
            retrieval = await retrieve_document_sources(
                session,
                user_id=user_id,
                document_id=document_id,
                query=question,
                embedding_provider=embedding_provider,
                evidence_threshold=0.0 if task == "summary" else None,
            )
            if not retrieval.evidence_sufficient:
                status = "NO_ANSWER"
            else:
                provider_sources = [
                    AnswerSource(
                        label=source.label,
                        text=source.text,
                        page_number=source.page_number,
                        section_title=source.section_title,
                    )
                    for source in retrieval.sources
                ]
                settings = get_settings()
                generated = await asyncio.wait_for(
                    answer_provider.answer(
                        question=question,
                        sources=provider_sources,
                        task=task,
                    ),
                    timeout=settings.rag_provider_timeout_seconds,
                )
                model = generated.model
                prompt_tokens = generated.prompt_tokens
                completion_tokens = generated.completion_tokens
                try:
                    selected_sources = validate_citation_labels(
                        generated.text, retrieval.sources
                    )
                    answer_text = generated.text
                    if answer_text == NO_ANSWER_TEXT:
                        status = "NO_ANSWER"
                except CitationValidationError:
                    status = "CITATION_REJECTED"
        except TimeoutError:
            status = "PROVIDER_TIMEOUT"
        except RagProviderError:
            status = "PROVIDER_ERROR"

    owned_ids = await _owned_source_ids(
        session,
        user_id=user_id,
        document_id=document_id,
        block_ids={source.content_block_id for source in selected_sources},
    )
    if owned_ids != {source.content_block_id for source in selected_sources}:
        selected_sources = []
        answer_text = NO_ANSWER_TEXT
        status = "CITATION_REJECTED"

    latency_ms = round((time.perf_counter() - started_at) * 1000)
    message = ChatMessage(
        chat_session_id=chat_session.id,
        role="assistant",
        content=answer_text,
        model=model,
        latency_ms=latency_ms,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cost_microusd=_cost_microusd(prompt_tokens, completion_tokens),
        status=status,
    )
    chat_session.updated_at = utc_now()
    session.add(message)
    await session.flush()
    citations = [
        Citation(
            chat_message_id=message.id,
            chunk_id=source.chunk_id,
            content_block_id=source.content_block_id,
            source_label=source.label,
            quoted_text=" ".join(source.text.split())[:500],
            page_number=source.page_number,
            section_title=source.section_title,
            relevance_score=source.score,
        )
        for source in selected_sources
    ]
    session.add_all(citations)
    await session.commit()
    for citation in citations:
        await session.refresh(citation)
    await session.refresh(message)
    return ChatResult(message=message, citations=citations)


async def list_chat_sessions(
    session: AsyncSession, *, user_id: str, document_id: UUID
) -> list[ChatSession]:
    return list(
        (
            await session.scalars(
                select(ChatSession)
                .join(Document, Document.id == ChatSession.document_id)
                .where(
                    ChatSession.user_id == user_id,
                    ChatSession.document_id == document_id,
                    Document.owner_id == user_id,
                )
                .order_by(ChatSession.updated_at.desc())
            )
        ).all()
    )


async def get_chat_session(
    session: AsyncSession, *, user_id: str, session_id: UUID
) -> ChatSession:
    chat_session = await session.scalar(
        select(ChatSession)
        .options(selectinload(ChatSession.messages).selectinload(ChatMessage.citations))
        .join(Document, Document.id == ChatSession.document_id)
        .where(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
            Document.owner_id == user_id,
        )
    )
    if chat_session is None:
        raise ChatResourceNotFoundError
    return chat_session


async def delete_chat_session(
    session: AsyncSession, *, user_id: str, session_id: UUID
) -> None:
    owned = await session.scalar(
        select(ChatSession.id)
        .join(Document, Document.id == ChatSession.document_id)
        .where(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
            Document.owner_id == user_id,
        )
    )
    if owned is None:
        raise ChatResourceNotFoundError
    await session.execute(delete(ChatSession).where(ChatSession.id == session_id))
    await session.commit()

import asyncio
import json
import re
from collections.abc import AsyncGenerator
from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_owner_id
from app.db.session import get_database_session
from app.schemas.rag import (
    ChatHistoryMessageResponse,
    ChatMessageResponse,
    ChatRequest,
    ChatSessionDetailResponse,
    ChatSessionListResponse,
    ChatSessionSummaryResponse,
    CitationResponse,
    ExplainRequest,
    SummarizeRequest,
)
from app.services.rag_chat import (
    ChatResourceNotFoundError,
    ChatResult,
    delete_chat_session,
    get_chat_session,
    list_chat_sessions,
    run_document_chat,
)
from app.services.rag_providers import (
    AnswerProvider,
    EmbeddingProvider,
    get_answer_provider,
    get_embedding_provider,
)
from app.services.rag_retrieval import DocumentNotAiReadyError, RagDocumentNotFoundError
from app.services.rate_limit import enforce_ai_rate_limit

router = APIRouter(tags=["grounded RAG"])
TOKEN_CHUNKS = re.compile(r"\S+\s*", re.UNICODE)

SessionDependency = Annotated[AsyncSession, Depends(get_database_session)]
OwnerDependency = Annotated[str, Depends(get_current_owner_id)]
EmbeddingDependency = Annotated[EmbeddingProvider, Depends(get_embedding_provider)]
AnswerDependency = Annotated[AnswerProvider, Depends(get_answer_provider)]


def _raise_rag_error(exc: Exception) -> NoReturn:
    if isinstance(exc, (RagDocumentNotFoundError, ChatResourceNotFoundError)):
        raise HTTPException(status_code=404, detail="RAG resource not found") from exc
    if isinstance(exc, DocumentNotAiReadyError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Document is not AI ready (status: {exc.status})",
        ) from exc
    raise HTTPException(status_code=500, detail="Document chat failed") from exc


def _message_response(result: ChatResult) -> ChatMessageResponse:
    message = result.message
    return ChatMessageResponse(
        id=message.id,
        session_id=message.chat_session_id,
        content=message.content,
        model=message.model,
        latency_ms=message.latency_ms,
        prompt_tokens=message.prompt_tokens,
        completion_tokens=message.completion_tokens,
        cost_microusd=message.cost_microusd,
        status=message.status,
        citations=[CitationResponse.model_validate(citation) for citation in result.citations],
        created_at=message.created_at,
    )


def _sse(event: str, payload: object) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def stream_chat_events(response: ChatMessageResponse) -> AsyncGenerator[str, None]:
    try:
        yield _sse(
            "message_started",
            {"message_id": str(response.id), "session_id": str(response.session_id)},
        )
        for token in TOKEN_CHUNKS.findall(response.content):
            yield _sse("token", {"text": token})
            await asyncio.sleep(0)
        for citation in response.citations:
            yield _sse("citation", citation.model_dump(mode="json"))
        yield _sse("message_completed", response.model_dump(mode="json"))
    except asyncio.CancelledError:
        raise


async def _chat_response(
    *,
    session: AsyncSession,
    owner_id: str,
    document_id: UUID,
    question: str,
    chat_session_id: UUID | None,
    stream: bool,
    task: str,
    embedding_provider: EmbeddingProvider,
    answer_provider: AnswerProvider,
) -> ChatMessageResponse | StreamingResponse:
    result = await run_document_chat(
        session,
        user_id=owner_id,
        document_id=document_id,
        question=question,
        session_id=chat_session_id,
        task=task,
        embedding_provider=embedding_provider,
        answer_provider=answer_provider,
    )
    response = _message_response(result)
    if not stream:
        return response
    return StreamingResponse(stream_chat_events(response), media_type="text/event-stream")


@router.post(
    "/api/documents/{document_id}/chat",
    response_model=None,
    dependencies=[Depends(enforce_ai_rate_limit)],
)
async def document_chat(
    document_id: UUID,
    payload: ChatRequest,
    session: SessionDependency,
    owner_id: OwnerDependency,
    embedding_provider: EmbeddingDependency,
    answer_provider: AnswerDependency,
) -> ChatMessageResponse | StreamingResponse:
    try:
        return await _chat_response(
            session=session,
            owner_id=owner_id,
            document_id=document_id,
            question=payload.question,
            chat_session_id=payload.session_id,
            stream=payload.stream,
            task="question",
            embedding_provider=embedding_provider,
            answer_provider=answer_provider,
        )
    except Exception as exc:
        _raise_rag_error(exc)


@router.post(
    "/api/documents/{document_id}/summarize",
    response_model=None,
    dependencies=[Depends(enforce_ai_rate_limit)],
)
async def summarize_document(
    document_id: UUID,
    payload: SummarizeRequest,
    session: SessionDependency,
    owner_id: OwnerDependency,
    embedding_provider: EmbeddingDependency,
    answer_provider: AnswerDependency,
) -> ChatMessageResponse | StreamingResponse:
    try:
        return await _chat_response(
            session=session,
            owner_id=owner_id,
            document_id=document_id,
            question="Tóm tắt các ý chính của tài liệu.",
            chat_session_id=payload.session_id,
            stream=payload.stream,
            task="summary",
            embedding_provider=embedding_provider,
            answer_provider=answer_provider,
        )
    except Exception as exc:
        _raise_rag_error(exc)


@router.post(
    "/api/documents/{document_id}/explain",
    response_model=None,
    dependencies=[Depends(enforce_ai_rate_limit)],
)
async def explain_document(
    document_id: UUID,
    payload: ExplainRequest,
    session: SessionDependency,
    owner_id: OwnerDependency,
    embedding_provider: EmbeddingDependency,
    answer_provider: AnswerDependency,
) -> ChatMessageResponse | StreamingResponse:
    try:
        return await _chat_response(
            session=session,
            owner_id=owner_id,
            document_id=document_id,
            question=payload.question,
            chat_session_id=payload.session_id,
            stream=payload.stream,
            task="explain",
            embedding_provider=embedding_provider,
            answer_provider=answer_provider,
        )
    except Exception as exc:
        _raise_rag_error(exc)


@router.get(
    "/api/documents/{document_id}/chat-sessions",
    response_model=ChatSessionListResponse,
)
async def document_chat_sessions(
    document_id: UUID, session: SessionDependency, owner_id: OwnerDependency
) -> ChatSessionListResponse:
    items = await list_chat_sessions(session, user_id=owner_id, document_id=document_id)
    return ChatSessionListResponse(
        items=[ChatSessionSummaryResponse.model_validate(item) for item in items]
    )


@router.get("/api/chat-sessions/{session_id}", response_model=ChatSessionDetailResponse)
async def chat_session_detail(
    session_id: UUID, session: SessionDependency, owner_id: OwnerDependency
) -> ChatSessionDetailResponse:
    try:
        item = await get_chat_session(session, user_id=owner_id, session_id=session_id)
    except ChatResourceNotFoundError as exc:
        _raise_rag_error(exc)
    return ChatSessionDetailResponse(
        id=item.id,
        document_id=item.document_id,
        title=item.title,
        created_at=item.created_at,
        updated_at=item.updated_at,
        messages=[
            ChatHistoryMessageResponse(
                id=message.id,
                role=message.role,
                content=message.content,
                model=message.model,
                status=message.status,
                citations=[
                    CitationResponse.model_validate(citation) for citation in message.citations
                ],
                created_at=message.created_at,
            )
            for message in item.messages
        ],
    )


@router.delete("/api/chat-sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_chat_session(
    session_id: UUID, session: SessionDependency, owner_id: OwnerDependency
) -> Response:
    try:
        await delete_chat_session(session, user_id=owner_id, session_id=session_id)
    except ChatResourceNotFoundError as exc:
        _raise_rag_error(exc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

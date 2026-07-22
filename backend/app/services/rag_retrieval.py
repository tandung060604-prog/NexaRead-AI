from __future__ import annotations

import asyncio
import math
import re
import unicodedata
from collections import Counter
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.document import ContentBlock, Document, DocumentVersion
from app.models.rag import Chunk
from app.services.rag_providers import EmbeddingProvider

TOKEN_PATTERN = re.compile(r"[\w]+", re.UNICODE)
QUERY_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "does",
    "for",
    "how",
    "in",
    "is",
    "of",
    "the",
    "this",
    "to",
    "what",
    "when",
    "where",
    "which",
    "who",
}


class DocumentNotAiReadyError(RuntimeError):
    def __init__(self, status: str) -> None:
        super().__init__(status)
        self.status = status


class RagDocumentNotFoundError(RuntimeError):
    pass


@dataclass(frozen=True)
class RetrievalCandidate:
    chunk: Chunk
    lexical_score: float
    vector_score: float
    fused_score: float


@dataclass(frozen=True)
class RetrievedSource:
    label: str
    chunk_id: UUID
    content_block_id: UUID
    text: str
    page_number: int
    section_title: str | None
    score: float


@dataclass(frozen=True)
class RetrievalResult:
    sources: list[RetrievedSource]
    evidence_sufficient: bool
    rerank_fallback: bool
    document_version_id: UUID


Reranker = Callable[
    [str, list[RetrievalCandidate]], Awaitable[list[RetrievalCandidate]]
]


def normalize_query(query: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", query).casefold().split())


def tokenize(text: str) -> list[str]:
    return [
        token
        for token in TOKEN_PATTERN.findall(normalize_query(text))
        if token not in QUERY_STOPWORDS
    ]


def lexical_relevance(query: str, text: str) -> float:
    query_tokens = tokenize(query)
    text_tokens = tokenize(text)
    if not query_tokens or not text_tokens:
        return 0.0
    counts = Counter(text_tokens)
    unique_query = set(query_tokens)
    matched = sum(1 for token in unique_query if counts[token] > 0)
    coverage = matched / len(unique_query)
    density = sum(min(counts[token], 3) for token in unique_query) / max(len(text_tokens), 1)
    phrase_bonus = 0.2 if normalize_query(query) in normalize_query(text) else 0.0
    return min(1.0, coverage * 0.75 + min(density * 2.0, 0.15) + phrase_bonus)


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        return 0.0
    denominator = math.sqrt(sum(value * value for value in left)) * math.sqrt(
        sum(value * value for value in right)
    )
    if denominator == 0:
        return 0.0
    return sum(a * b for a, b in zip(left, right, strict=True)) / denominator


def reciprocal_rank_fusion(
    lexical_ids: list[UUID], vector_ids: list[UUID], *, rank_constant: int = 60
) -> dict[UUID, float]:
    scores: dict[UUID, float] = {}
    for ranked in (lexical_ids, vector_ids):
        for rank, chunk_id in enumerate(ranked, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (rank_constant + rank)
    return scores


def fuse_candidates(
    chunks: list[Chunk], query: str, query_vector: list[float], *, top_k: int
) -> list[RetrievalCandidate]:
    lexical = {chunk.id: lexical_relevance(query, chunk.text) for chunk in chunks}
    vector = {
        chunk.id: cosine_similarity(query_vector, list(chunk.embedding or [])) for chunk in chunks
    }
    lexical_rank = sorted(
        (chunk for chunk in chunks if lexical[chunk.id] > 0),
        key=lambda item: lexical[item.id],
        reverse=True,
    )[:top_k]
    vector_rank = sorted(
        # The offline hash embedding is exact-token oriented. A high gate prevents
        # accidental hash collisions from becoming evidence when lexical overlap is absent.
        (chunk for chunk in chunks if vector[chunk.id] > 0.75 or lexical[chunk.id] > 0),
        key=lambda item: vector[item.id],
        reverse=True,
    )[:top_k]
    rrf = reciprocal_rank_fusion(
        [chunk.id for chunk in lexical_rank], [chunk.id for chunk in vector_rank]
    )
    maximum_rrf = max(rrf.values(), default=1.0)
    candidates = [
        RetrievalCandidate(
            chunk=chunk,
            lexical_score=lexical[chunk.id],
            vector_score=max(0.0, vector[chunk.id]),
            fused_score=(
                0.35 * (rrf.get(chunk.id, 0.0) / maximum_rrf)
                + 0.4 * lexical[chunk.id]
                + 0.25 * max(0.0, vector[chunk.id])
            ),
        )
        for chunk in chunks
        if chunk.id in rrf
    ]
    return sorted(candidates, key=lambda item: item.fused_score, reverse=True)[:top_k]


def _rerank_sync(query: str, candidates: list[RetrievalCandidate]) -> list[RetrievalCandidate]:
    return sorted(
        candidates,
        key=lambda item: (
            0.55 * item.fused_score + 0.45 * lexical_relevance(query, item.chunk.text)
        ),
        reverse=True,
    )


async def _default_reranker(
    query: str, candidates: list[RetrievalCandidate]
) -> list[RetrievalCandidate]:
    return await asyncio.to_thread(_rerank_sync, query, candidates)


async def _load_active_document(
    session: AsyncSession, document_id: UUID, user_id: str
) -> tuple[Document, DocumentVersion]:
    result = await session.execute(
        select(Document, DocumentVersion)
        .join(DocumentVersion, DocumentVersion.document_id == Document.id)
        .where(Document.id == document_id, Document.owner_id == user_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    row = result.one_or_none()
    if row is None:
        raise RagDocumentNotFoundError
    document, version = row
    if document.status != "AI_READY":
        raise DocumentNotAiReadyError(document.status)
    return document, version


async def _database_candidates(
    session: AsyncSession,
    *,
    document_id: UUID,
    version_id: UUID,
    query: str,
    query_vector: list[float],
    top_k: int,
) -> list[RetrievalCandidate]:
    dialect = session.bind.dialect.name if session.bind is not None else ""
    filters = (
        Chunk.document_id == document_id,
        Chunk.document_version_id == version_id,
        Chunk.embedding.is_not(None),
    )
    if dialect != "postgresql":
        chunks = list((await session.scalars(select(Chunk).where(*filters))).all())
        return fuse_candidates(chunks, query, query_vector, top_k=top_k)

    distance = Chunk.embedding.cosine_distance(query_vector).label("distance")
    vector_rows = (
        await session.execute(
            select(Chunk, distance).where(*filters).order_by(distance).limit(top_k)
        )
    ).all()
    document_vector = func.to_tsvector("simple", Chunk.text)
    query_vector_sql = func.plainto_tsquery("simple", query)
    rank = func.ts_rank_cd(document_vector, query_vector_sql).label("rank")
    lexical_rows = (
        await session.execute(
            select(Chunk, rank)
            .where(*filters, document_vector.op("@@")(query_vector_sql))
            .order_by(rank.desc())
            .limit(top_k)
        )
    ).all()
    chunks_by_id = {row[0].id: row[0] for row in [*vector_rows, *lexical_rows]}
    lexical_scores = {row[0].id: float(row[1]) for row in lexical_rows}
    vector_scores = {row[0].id: max(0.0, 1.0 - float(row[1])) for row in vector_rows}
    rrf = reciprocal_rank_fusion(
        [row[0].id for row in lexical_rows], [row[0].id for row in vector_rows]
    )
    maximum_rrf = max(rrf.values(), default=1.0)
    return sorted(
        [
            RetrievalCandidate(
                chunk=chunk,
                lexical_score=lexical_scores.get(chunk_id, 0.0),
                vector_score=vector_scores.get(chunk_id, 0.0),
                fused_score=(
                    0.35 * rrf.get(chunk_id, 0.0) / maximum_rrf
                    + 0.4 * lexical_relevance(query, chunk.text)
                    + 0.25 * vector_scores.get(chunk_id, 0.0)
                ),
            )
            for chunk_id, chunk in chunks_by_id.items()
        ],
        key=lambda item: item.fused_score,
        reverse=True,
    )[:top_k]


async def retrieve_document_sources(
    session: AsyncSession,
    *,
    user_id: str,
    document_id: UUID,
    query: str,
    embedding_provider: EmbeddingProvider,
    top_k: int | None = None,
    evidence_threshold: float | None = None,
    reranker: Reranker | None = None,
) -> RetrievalResult:
    settings = get_settings()
    normalized_query = normalize_query(query)
    _, version = await _load_active_document(session, document_id, user_id)
    embedding = await embedding_provider.embed([normalized_query])
    candidates = await _database_candidates(
        session,
        document_id=document_id,
        version_id=version.id,
        query=normalized_query,
        query_vector=embedding.vectors[0],
        top_k=top_k or settings.rag_top_k,
    )
    if not candidates and evidence_threshold == 0.0:
        fallback_chunks = list(
            (
                await session.scalars(
                    select(Chunk)
                    .where(
                        Chunk.document_id == document_id,
                        Chunk.document_version_id == version.id,
                        Chunk.embedding.is_not(None),
                    )
                    .order_by(Chunk.page_start, Chunk.created_at)
                    .limit(top_k or settings.rag_top_k)
                )
            ).all()
        )
        candidates = [
            RetrievalCandidate(
                chunk=chunk,
                lexical_score=0.0,
                vector_score=0.0,
                fused_score=0.01,
            )
            for chunk in fallback_chunks
        ]
    rerank_fallback = False
    try:
        candidates = await asyncio.wait_for(
            (reranker or _default_reranker)(normalized_query, candidates),
            timeout=settings.rag_rerank_timeout_seconds,
        )
    except TimeoutError:
        rerank_fallback = True

    threshold = (
        settings.rag_evidence_threshold
        if evidence_threshold is None
        else evidence_threshold
    )
    selected = [candidate for candidate in candidates if candidate.fused_score >= threshold]
    block_ids = {
        UUID(block_id)
        for candidate in selected
        for block_id in candidate.chunk.content_block_ids_json
    }
    blocks = {
        block.id: block
        for block in (
            await session.scalars(
                select(ContentBlock).where(
                    ContentBlock.id.in_(block_ids),
                    ContentBlock.document_version_id == version.id,
                )
            )
        ).all()
    } if block_ids else {}
    sources: list[RetrievedSource] = []
    for index, candidate in enumerate(selected, start=1):
        candidate_blocks = [
            blocks[UUID(block_id)]
            for block_id in candidate.chunk.content_block_ids_json
            if UUID(block_id) in blocks
        ]
        if not candidate_blocks:
            continue
        best_block = max(
            candidate_blocks,
            key=lambda item: lexical_relevance(normalized_query, item.text),
        )
        sources.append(
            RetrievedSource(
                label=f"S{index}",
                chunk_id=candidate.chunk.id,
                content_block_id=best_block.id,
                text=candidate.chunk.text,
                page_number=best_block.page_number,
                section_title=str(candidate.chunk.chunk_metadata.get("section_title") or "")
                or None,
                score=candidate.fused_score,
            )
        )
    return RetrievalResult(
        sources=sources,
        evidence_sufficient=bool(sources),
        rerank_fallback=rerank_fallback,
        document_version_id=version.id,
    )

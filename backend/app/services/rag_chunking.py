from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import ContentBlock
from app.models.rag import Chunk
from app.services.rag_providers import EmbeddingProvider

CHUNKER_VERSION = "structure-v1"
MAX_CHUNK_CHARACTERS = 1_600
OVERLAP_CHARACTERS = 240
SPECIAL_BLOCK_TYPES = {"CODE", "TABLE", "FORMULA"}
TOKEN_PATTERN = re.compile(r"[\w]+", re.UNICODE)


@dataclass(frozen=True)
class ChunkBlock:
    id: UUID
    sequence_number: int
    block_type: str
    text: str
    page_number: int
    content_hash: str
    suppressed: bool = False


@dataclass(frozen=True)
class ChunkSpec:
    section_block_id: UUID | None
    text: str
    token_count: int
    page_start: int
    page_end: int
    content_block_ids: tuple[UUID, ...]
    metadata: dict[str, object]
    content_hash: str


def _token_count(text: str) -> int:
    return max(1, math.ceil(len(TOKEN_PATTERN.findall(text)) * 1.3))


def _make_spec(
    *, document_version_id: UUID, blocks: list[ChunkBlock], section_title: str | None
) -> ChunkSpec:
    text = "\n\n".join(block.text.strip() for block in blocks if block.text.strip())
    section = next((block for block in blocks if block.block_type.startswith("HEADING")), None)
    stable_identity = "|".join(block.content_hash for block in blocks)
    digest = hashlib.sha256(
        f"{CHUNKER_VERSION}|{document_version_id}|{stable_identity}|{text}".encode()
    ).hexdigest()
    return ChunkSpec(
        section_block_id=section.id if section else None,
        text=text,
        token_count=_token_count(text),
        page_start=min(block.page_number for block in blocks),
        page_end=max(block.page_number for block in blocks),
        content_block_ids=tuple(block.id for block in blocks),
        metadata={
            "chunker_version": CHUNKER_VERSION,
            "section_title": section_title,
            "sequence_start": blocks[0].sequence_number,
            "sequence_end": blocks[-1].sequence_number,
            "block_types": [block.block_type for block in blocks],
        },
        content_hash=digest,
    )


def build_chunk_specs(
    document_version_id: UUID,
    blocks: list[ChunkBlock],
    *,
    max_characters: int = MAX_CHUNK_CHARACTERS,
) -> list[ChunkSpec]:
    ordered = [
        block
        for block in sorted(blocks, key=lambda item: item.sequence_number)
        if block.text.strip() and block.block_type != "PAGE_BREAK" and not block.suppressed
    ]
    specs: list[ChunkSpec] = []
    pending: list[ChunkBlock] = []
    section_title: str | None = None

    def flush(*, overlap: bool = False) -> None:
        nonlocal pending
        if not pending:
            return
        specs.append(
            _make_spec(
                document_version_id=document_version_id,
                blocks=pending,
                section_title=section_title,
            )
        )
        if overlap:
            retained: list[ChunkBlock] = []
            retained_length = 0
            for item in reversed(pending):
                if item.block_type.startswith("HEADING") or item.block_type in SPECIAL_BLOCK_TYPES:
                    break
                retained.insert(0, item)
                retained_length += len(item.text)
                if retained_length >= OVERLAP_CHARACTERS:
                    break
            pending = retained
        else:
            pending = []

    for block in ordered:
        if block.block_type.startswith("HEADING"):
            flush()
            section_title = block.text.strip()[:500]
            pending = [block]
            continue
        if block.block_type in SPECIAL_BLOCK_TYPES:
            flush()
            pending = [block]
            flush()
            continue
        prospective_length = sum(len(item.text) + 2 for item in pending) + len(block.text)
        if pending and prospective_length > max_characters:
            flush(overlap=True)
        pending.append(block)
    flush()
    return specs


async def index_document_version(
    session: AsyncSession,
    *,
    document_id: UUID,
    document_version_id: UUID,
    embedding_provider: EmbeddingProvider,
) -> int:
    rows = (
        await session.scalars(
            select(ContentBlock)
            .where(ContentBlock.document_version_id == document_version_id)
            .order_by(ContentBlock.sequence_number)
        )
    ).all()
    specs = build_chunk_specs(
        document_version_id,
        [
            ChunkBlock(
                id=row.id,
                sequence_number=row.sequence_number,
                block_type=row.block_type,
                text=row.text,
                page_number=row.page_number,
                content_hash=row.content_hash,
                suppressed=row.block_metadata.get("suppressed") is True,
            )
            for row in rows
        ],
    )
    existing = {
        chunk.content_hash: chunk
        for chunk in (
            await session.scalars(
                select(Chunk).where(Chunk.document_version_id == document_version_id)
            )
        ).all()
    }
    active_hashes = {spec.content_hash for spec in specs}
    if existing.keys() - active_hashes:
        await session.execute(
            delete(Chunk).where(
                Chunk.document_version_id == document_version_id,
                Chunk.content_hash.not_in(active_hashes),
            )
        )
    if not specs:
        return 0
    embedding_result = await embedding_provider.embed([spec.text for spec in specs])
    if len(embedding_result.vectors) != len(specs):
        raise ValueError("Embedding provider returned an unexpected vector count")
    for spec, vector in zip(specs, embedding_result.vectors, strict=True):
        chunk = existing.get(spec.content_hash)
        if chunk is None:
            chunk = Chunk(
                document_id=document_id,
                document_version_id=document_version_id,
                content_hash=spec.content_hash,
            )
            session.add(chunk)
        chunk.section_block_id = spec.section_block_id
        chunk.text = spec.text
        chunk.token_count = spec.token_count
        chunk.page_start = spec.page_start
        chunk.page_end = spec.page_end
        chunk.content_block_ids_json = [str(block_id) for block_id in spec.content_block_ids]
        chunk.embedding = vector
        chunk.chunk_metadata = {
            **spec.metadata,
            "embedding_model": embedding_result.model,
        }
    await session.flush()
    return len(specs)

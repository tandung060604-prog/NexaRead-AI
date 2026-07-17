from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import ContentBlock
from app.models.keyword import Keyword, KeywordOccurrence

DEFAULT_MIN_CONFIDENCE = 0.75
MAX_ACTIVE_PER_BLOCK = 6


@dataclass(frozen=True)
class KeywordSpec:
    id: UUID
    canonical_name: str
    aliases: tuple[str, ...]
    ambiguity_required_any: tuple[str, ...] = ()


@dataclass(frozen=True)
class BlockSpec:
    id: UUID
    text: str
    sequence_number: int
    chapter_index: int | None = None
    section_index: int | None = None
    block_type: str = "PARAGRAPH"


@dataclass(frozen=True)
class DetectedOccurrence:
    keyword_id: UUID
    content_block_id: UUID
    start_offset: int
    end_offset: int
    surface_text: str
    confidence: float
    detection_method: str
    context_hash: str
    is_suppressed: bool


def _context_hash(text: str, start: int, end: int) -> str:
    context = " ".join(text[max(0, start - 80) : min(len(text), end + 80)].casefold().split())
    return hashlib.sha256(context.encode("utf-8")).hexdigest()


def _keyword_matches(block: BlockSpec, keyword: KeywordSpec) -> list[DetectedOccurrence]:
    candidates: list[DetectedOccurrence] = []
    context = block.text.casefold()
    has_required_context = not keyword.ambiguity_required_any or any(
        term.casefold() in context for term in keyword.ambiguity_required_any
    )
    terms = [
        (keyword.canonical_name, "EXACT", 0.97),
        *[(alias, "ALIAS", 0.91) for alias in keyword.aliases],
    ]
    seen_offsets: set[tuple[int, int]] = set()
    for term, method, confidence in sorted(terms, key=lambda item: len(item[0]), reverse=True):
        if not term.strip():
            continue
        pattern = re.compile(rf"(?<!\w){re.escape(term)}(?!\w)", re.IGNORECASE | re.UNICODE)
        for match in pattern.finditer(block.text):
            offsets = (match.start(), match.end())
            if offsets in seen_offsets:
                continue
            seen_offsets.add(offsets)
            resolved_method = "CONTEXT_RULE" if keyword.ambiguity_required_any else method
            resolved_confidence = (
                0.88 if keyword.ambiguity_required_any and has_required_context else confidence
            )
            if keyword.ambiguity_required_any and not has_required_context:
                resolved_confidence = 0.55
            candidates.append(
                DetectedOccurrence(
                    keyword_id=keyword.id,
                    content_block_id=block.id,
                    start_offset=match.start(),
                    end_offset=match.end(),
                    surface_text=match.group(0),
                    confidence=resolved_confidence,
                    detection_method=resolved_method,
                    context_hash=_context_hash(block.text, match.start(), match.end()),
                    is_suppressed=resolved_confidence < DEFAULT_MIN_CONFIDENCE,
                )
            )
    return candidates


def detect_keyword_candidates(
    blocks: list[BlockSpec], keywords: list[KeywordSpec]
) -> list[DetectedOccurrence]:
    detected: list[DetectedOccurrence] = []
    seen_by_section: set[tuple[object, UUID]] = set()
    inferred_section = 0

    for block in sorted(blocks, key=lambda item: item.sequence_number):
        if block.block_type.startswith("HEADING"):
            inferred_section += 1
        section: object = (
            (block.chapter_index, block.section_index)
            if block.chapter_index is not None or block.section_index is not None
            else inferred_section
        )
        raw = [match for keyword in keywords for match in _keyword_matches(block, keyword)]
        # Prefer the longest, highest-confidence candidate when aliases overlap.
        selected: list[DetectedOccurrence] = []
        for candidate in sorted(
            raw,
            key=lambda item: (
                item.start_offset,
                -(item.end_offset - item.start_offset),
                -item.confidence,
            ),
        ):
            if any(
                candidate.start_offset < existing.end_offset
                and candidate.end_offset > existing.start_offset
                for existing in selected
            ):
                continue
            selected.append(candidate)

        active_in_block = 0
        for candidate in sorted(selected, key=lambda item: item.start_offset):
            identity = (section, candidate.keyword_id)
            suppressed = (
                candidate.is_suppressed
                or identity in seen_by_section
                or active_in_block >= MAX_ACTIVE_PER_BLOCK
            )
            if not suppressed:
                seen_by_section.add(identity)
                active_in_block += 1
            detected.append(
                DetectedOccurrence(**{**candidate.__dict__, "is_suppressed": suppressed})
            )
    return detected


def _rules(keyword: Keyword) -> tuple[str, ...]:
    values = keyword.ambiguity_rules.get("required_any", [])
    if not isinstance(values, list):
        return ()
    return tuple(str(value) for value in values if isinstance(value, str))


async def detect_keywords_for_version(
    session: AsyncSession, document_id: UUID, version_id: UUID
) -> int:
    await session.execute(
        delete(KeywordOccurrence).where(KeywordOccurrence.document_version_id == version_id)
    )
    keyword_rows = (await session.scalars(select(Keyword).where(Keyword.status == "ACTIVE"))).all()
    if not keyword_rows:
        return 0
    block_rows = (
        await session.scalars(
            select(ContentBlock)
            .where(ContentBlock.document_version_id == version_id)
            .order_by(ContentBlock.sequence_number)
        )
    ).all()
    occurrences = detect_keyword_candidates(
        [
            BlockSpec(
                id=block.id,
                text=block.text,
                sequence_number=block.sequence_number,
                chapter_index=block.chapter_index,
                section_index=block.section_index,
                block_type=block.block_type,
            )
            for block in block_rows
        ],
        [
            KeywordSpec(
                id=keyword.id,
                canonical_name=keyword.canonical_name,
                aliases=tuple(keyword.aliases),
                ambiguity_required_any=_rules(keyword),
            )
            for keyword in keyword_rows
        ],
    )
    session.add_all(
        [
            KeywordOccurrence(
                keyword_id=item.keyword_id,
                document_id=document_id,
                document_version_id=version_id,
                content_block_id=item.content_block_id,
                start_offset=item.start_offset,
                end_offset=item.end_offset,
                surface_text=item.surface_text,
                confidence=item.confidence,
                detection_method=item.detection_method,
                context_hash=item.context_hash,
                is_suppressed=item.is_suppressed,
            )
            for item in occurrences
        ]
    )
    return len(occurrences)

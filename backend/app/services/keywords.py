from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import ContentBlock, Document, DocumentVersion
from app.models.keyword import (
    KEYWORD_CATEGORIES,
    Keyword,
    KeywordFeedback,
    KeywordOccurrence,
    UserKeywordPreference,
)
from app.schemas.keyword import KeywordFeedbackCreate, KeywordPreferenceUpdate
from app.services.documents import DocumentNotFoundError

OccurrenceRow = tuple[KeywordOccurrence, Keyword, ContentBlock]


async def _ensure_owned_document(session: AsyncSession, document_id: UUID, owner_id: str) -> None:
    exists = await session.scalar(
        select(Document.id).where(Document.id == document_id, Document.owner_id == owner_id)
    )
    if exists is None:
        raise DocumentNotFoundError


async def get_keyword_preference(
    session: AsyncSession, user_id: str
) -> UserKeywordPreference | None:
    value = await session.scalar(
        select(UserKeywordPreference).where(UserKeywordPreference.user_id == user_id)
    )
    return value


async def save_keyword_preference(
    session: AsyncSession, user_id: str, payload: KeywordPreferenceUpdate
) -> UserKeywordPreference:
    preference = await get_keyword_preference(session, user_id)
    if preference is None:
        preference = UserKeywordPreference(user_id=user_id)
        session.add(preference)
    preference.enabled = payload.enabled
    preference.user_level = payload.user_level
    preference.enabled_categories = payload.enabled_categories
    preference.min_confidence = payload.min_confidence
    await session.commit()
    await session.refresh(preference)
    return preference


def _allowed_difficulties(level: str) -> tuple[str, ...]:
    if level == "ADVANCED":
        return ("ADVANCED",)
    if level == "INTERMEDIATE":
        return ("INTERMEDIATE", "ADVANCED")
    return ("BEGINNER", "INTERMEDIATE", "ADVANCED")


async def list_document_keywords(
    session: AsyncSession,
    document_id: UUID,
    owner_id: str,
    *,
    category: str | None = None,
    difficulty: str | None = None,
    min_confidence: float | None = None,
    include_suppressed: bool = False,
) -> list[OccurrenceRow]:
    await _ensure_owned_document(session, document_id, owner_id)
    preference = await get_keyword_preference(session, owner_id)
    if preference is not None and not preference.enabled:
        return []
    latest_version = (
        select(DocumentVersion.id)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
        .scalar_subquery()
    )
    query = (
        select(KeywordOccurrence, Keyword, ContentBlock)
        .join(Keyword, Keyword.id == KeywordOccurrence.keyword_id)
        .join(ContentBlock, ContentBlock.id == KeywordOccurrence.content_block_id)
        .where(
            KeywordOccurrence.document_id == document_id,
            KeywordOccurrence.document_version_id == latest_version,
            Keyword.status == "ACTIVE",
        )
        .order_by(ContentBlock.sequence_number, KeywordOccurrence.start_offset)
    )
    threshold = max(min_confidence or 0, preference.min_confidence if preference else 0.75)
    query = query.where(KeywordOccurrence.confidence >= threshold)
    if not include_suppressed:
        query = query.where(KeywordOccurrence.is_suppressed.is_(False))
    enabled_categories = preference.enabled_categories if preference else list(KEYWORD_CATEGORIES)
    if category:
        query = query.where(Keyword.category == category)
    else:
        query = query.where(Keyword.category.in_(enabled_categories))
    if difficulty:
        query = query.where(Keyword.difficulty == difficulty)
    else:
        query = query.where(
            Keyword.difficulty.in_(
                _allowed_difficulties(preference.user_level if preference else "BEGINNER")
            )
        )
    result = await session.execute(query)
    return [(row[0], row[1], row[2]) for row in result.all()]


async def list_keyword_occurrences(
    session: AsyncSession,
    document_id: UUID,
    keyword_id: UUID,
    owner_id: str,
    *,
    include_suppressed: bool = False,
) -> list[OccurrenceRow]:
    rows = await list_document_keywords(
        session, document_id, owner_id, min_confidence=0, include_suppressed=include_suppressed
    )
    return [row for row in rows if row[0].keyword_id == keyword_id]


async def get_keyword_detail(
    session: AsyncSession, keyword_id: UUID
) -> tuple[Keyword, list[Keyword]] | None:
    keyword = await session.get(Keyword, keyword_id)
    if keyword is None or keyword.status != "ACTIVE":
        return None
    related_ids = [UUID(value) for value in keyword.related_keyword_ids]
    related = (
        list((await session.scalars(select(Keyword).where(Keyword.id.in_(related_ids)))).all())
        if related_ids
        else []
    )
    return keyword, related


async def save_keyword_feedback(
    session: AsyncSession, user_id: str, payload: KeywordFeedbackCreate
) -> KeywordFeedback:
    await _ensure_owned_document(session, payload.document_id, user_id)
    occurrence = await session.scalar(
        select(KeywordOccurrence).where(
            KeywordOccurrence.id == payload.occurrence_id,
            KeywordOccurrence.document_id == payload.document_id,
        )
    )
    if occurrence is None:
        raise DocumentNotFoundError
    feedback = await session.scalar(
        select(KeywordFeedback).where(
            KeywordFeedback.user_id == user_id,
            KeywordFeedback.occurrence_id == payload.occurrence_id,
        )
    )
    if feedback is None:
        feedback = KeywordFeedback(
            user_id=user_id,
            document_id=payload.document_id,
            occurrence_id=payload.occurrence_id,
            feedback_type=payload.feedback_type,
        )
        session.add(feedback)
    feedback.feedback_type = payload.feedback_type
    feedback.comment = payload.comment
    await session.commit()
    await session.refresh(feedback)
    return feedback


async def keyword_feedback_metrics(session: AsyncSession) -> tuple[int, int]:
    total = await session.scalar(select(func.count()).select_from(KeywordFeedback)) or 0
    corrected = (
        await session.scalar(
            select(func.count())
            .select_from(KeywordFeedback)
            .where(KeywordFeedback.feedback_type.in_(("NOT_TECHNICAL", "WRONG_MEANING")))
        )
        or 0
    )
    return int(total), int(corrected)

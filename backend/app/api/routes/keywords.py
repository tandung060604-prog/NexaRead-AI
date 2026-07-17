from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_owner_id
from app.db.session import get_database_session
from app.models.document import ContentBlock
from app.models.keyword import KEYWORD_CATEGORIES, Keyword, KeywordOccurrence
from app.schemas.keyword import (
    DocumentKeywordResponse,
    KeywordDetailResponse,
    KeywordFeedbackCreate,
    KeywordFeedbackResponse,
    KeywordOccurrenceResponse,
    KeywordPreferenceResponse,
    KeywordPreferenceUpdate,
    KeywordSummaryResponse,
)
from app.services.documents import DocumentNotFoundError
from app.services.keywords import (
    get_keyword_detail,
    get_keyword_preference,
    list_document_keywords,
    list_keyword_occurrences,
    save_keyword_feedback,
    save_keyword_preference,
)

router = APIRouter(tags=["keywords"])
SessionDependency = Annotated[AsyncSession, Depends(get_database_session)]
OwnerDependency = Annotated[str, Depends(get_current_owner_id)]


def _summary(keyword: Keyword) -> KeywordSummaryResponse:
    return KeywordSummaryResponse.model_validate(keyword)


def _occurrence(
    occurrence: KeywordOccurrence, keyword: Keyword, block: ContentBlock
) -> KeywordOccurrenceResponse:
    return KeywordOccurrenceResponse(
        id=occurrence.id,
        keyword=_summary(keyword),
        document_id=occurrence.document_id,
        document_version_id=occurrence.document_version_id,
        content_block_id=occurrence.content_block_id,
        page_number=block.page_number,
        sequence_number=block.sequence_number,
        start_offset=occurrence.start_offset,
        end_offset=occurrence.end_offset,
        surface_text=occurrence.surface_text,
        confidence=occurrence.confidence,
        detection_method=occurrence.detection_method,
        is_suppressed=occurrence.is_suppressed,
    )


@router.get("/api/documents/{document_id}/keywords", response_model=DocumentKeywordResponse)
async def document_keywords(
    document_id: UUID,
    session: SessionDependency,
    owner_id: OwnerDependency,
    category: str | None = None,
    difficulty: str | None = None,
    min_confidence: Annotated[float | None, Query(ge=0, le=1)] = None,
    include_suppressed: bool = False,
) -> DocumentKeywordResponse:
    if category is not None and category not in KEYWORD_CATEGORIES:
        raise HTTPException(status_code=422, detail="Unknown keyword category")
    if difficulty is not None and difficulty not in ("BEGINNER", "INTERMEDIATE", "ADVANCED"):
        raise HTTPException(status_code=422, detail="Unknown keyword difficulty")
    try:
        rows = await list_document_keywords(
            session,
            document_id,
            owner_id,
            category=category,
            difficulty=difficulty,
            min_confidence=min_confidence,
            include_suppressed=include_suppressed,
        )
    except DocumentNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Document keywords not found") from exc
    items = [_occurrence(*row) for row in rows]
    return DocumentKeywordResponse(
        items=items,
        total=len(items),
        categories=list(KEYWORD_CATEGORIES),
        taxonomy_version=items[0].keyword.taxonomy_version if items else None,
    )


@router.get(
    "/api/documents/{document_id}/keywords/{keyword_id}/occurrences",
    response_model=DocumentKeywordResponse,
)
async def keyword_occurrences(
    document_id: UUID,
    keyword_id: UUID,
    session: SessionDependency,
    owner_id: OwnerDependency,
    include_suppressed: bool = False,
) -> DocumentKeywordResponse:
    try:
        rows = await list_keyword_occurrences(
            session, document_id, keyword_id, owner_id, include_suppressed=include_suppressed
        )
    except DocumentNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Keyword occurrences not found") from exc
    items = [_occurrence(*row) for row in rows]
    return DocumentKeywordResponse(
        items=items,
        total=len(items),
        categories=list(KEYWORD_CATEGORIES),
        taxonomy_version=items[0].keyword.taxonomy_version if items else None,
    )


@router.get("/api/keywords/{keyword_id}", response_model=KeywordDetailResponse)
async def keyword_detail(
    keyword_id: UUID, session: SessionDependency, owner_id: OwnerDependency
) -> KeywordDetailResponse:
    result = await get_keyword_detail(session, keyword_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Keyword not found")
    keyword, related = result
    preference = await get_keyword_preference(session, owner_id)
    level = preference.user_level if preference else "BEGINNER"
    explanation = {
        "BEGINNER": keyword.beginner_explanation,
        "INTERMEDIATE": keyword.intermediate_explanation,
        "ADVANCED": keyword.advanced_explanation,
    }[level]
    return KeywordDetailResponse(
        **_summary(keyword).model_dump(),
        aliases=keyword.aliases,
        explanation=explanation,
        beginner_explanation=keyword.beginner_explanation,
        intermediate_explanation=keyword.intermediate_explanation,
        advanced_explanation=keyword.advanced_explanation,
        related_keywords=[_summary(item) for item in related],
    )


@router.post("/api/keyword-feedback", response_model=KeywordFeedbackResponse)
async def create_keyword_feedback(
    payload: KeywordFeedbackCreate, session: SessionDependency, owner_id: OwnerDependency
) -> KeywordFeedbackResponse:
    try:
        feedback = await save_keyword_feedback(session, owner_id, payload)
    except DocumentNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Keyword occurrence not found") from exc
    return KeywordFeedbackResponse.model_validate(feedback)


@router.get("/api/users/me/keyword-preferences", response_model=KeywordPreferenceResponse)
async def keyword_preferences(
    session: SessionDependency, owner_id: OwnerDependency
) -> KeywordPreferenceResponse:
    preference = await get_keyword_preference(session, owner_id)
    if preference is None:
        return KeywordPreferenceResponse()
    return KeywordPreferenceResponse.model_validate(preference)


@router.put("/api/users/me/keyword-preferences", response_model=KeywordPreferenceResponse)
async def update_keyword_preferences(
    payload: KeywordPreferenceUpdate, session: SessionDependency, owner_id: OwnerDependency
) -> KeywordPreferenceResponse:
    preference = await save_keyword_preference(session, owner_id, payload)
    return KeywordPreferenceResponse.model_validate(preference)

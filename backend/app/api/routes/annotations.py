from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_owner_id
from app.db.session import get_database_session
from app.schemas.annotation import (
    BookmarkCreate,
    BookmarkListResponse,
    BookmarkResponse,
    HighlightCreate,
    HighlightListResponse,
    HighlightResponse,
    HighlightUpdate,
    NoteCreate,
    NoteResponse,
    NoteUpdate,
    ProgressResponse,
    ProgressUpdate,
    ReadingPreferenceResponse,
    ReadingPreferenceUpdate,
)
from app.services.annotations import (
    AnnotationConflictError,
    AnnotationNotFoundError,
    AnnotationValidationError,
    create_bookmark,
    create_highlight,
    create_note,
    delete_bookmark,
    delete_highlight,
    delete_note,
    get_preferences,
    get_progress,
    list_bookmarks,
    list_highlights,
    update_highlight,
    update_note,
    upsert_preferences,
    upsert_progress,
)
from app.services.documents import DocumentNotFoundError

router = APIRouter(tags=["reader annotations"])

SessionDependency = Annotated[AsyncSession, Depends(get_database_session)]
OwnerDependency = Annotated[str, Depends(get_current_owner_id)]


def _raise_annotation_error(exc: Exception) -> NoReturn:
    if isinstance(exc, (DocumentNotFoundError, AnnotationNotFoundError)):
        raise HTTPException(status_code=404, detail="Reader resource not found") from exc
    if isinstance(exc, AnnotationValidationError):
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if isinstance(exc, AnnotationConflictError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    raise HTTPException(status_code=500, detail="Annotation operation failed") from exc


@router.get(
    "/api/documents/{document_id}/progress",
    response_model=ProgressResponse | None,
)
async def document_progress(
    document_id: UUID, session: SessionDependency, owner_id: OwnerDependency
) -> ProgressResponse | None:
    try:
        progress = await get_progress(session, document_id, owner_id)
    except DocumentNotFoundError as exc:
        _raise_annotation_error(exc)
    return ProgressResponse.model_validate(progress) if progress is not None else None


@router.put("/api/documents/{document_id}/progress", response_model=ProgressResponse)
async def save_document_progress(
    document_id: UUID,
    payload: ProgressUpdate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> ProgressResponse:
    try:
        progress = await upsert_progress(session, document_id, owner_id, payload)
    except (DocumentNotFoundError, AnnotationValidationError) as exc:
        _raise_annotation_error(exc)
    return ProgressResponse.model_validate(progress)


@router.get(
    "/api/documents/{document_id}/bookmarks",
    response_model=BookmarkListResponse,
)
async def document_bookmarks(
    document_id: UUID, session: SessionDependency, owner_id: OwnerDependency
) -> BookmarkListResponse:
    try:
        bookmarks = await list_bookmarks(session, document_id, owner_id)
    except DocumentNotFoundError as exc:
        _raise_annotation_error(exc)
    return BookmarkListResponse(
        items=[BookmarkResponse.model_validate(bookmark) for bookmark in bookmarks]
    )


@router.post(
    "/api/documents/{document_id}/bookmarks",
    response_model=BookmarkResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_document_bookmark(
    document_id: UUID,
    payload: BookmarkCreate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> BookmarkResponse:
    try:
        bookmark = await create_bookmark(session, document_id, owner_id, payload)
    except (DocumentNotFoundError, AnnotationValidationError) as exc:
        _raise_annotation_error(exc)
    return BookmarkResponse.model_validate(bookmark)


@router.delete("/api/bookmarks/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_bookmark(
    bookmark_id: UUID, session: SessionDependency, owner_id: OwnerDependency
) -> Response:
    try:
        await delete_bookmark(session, bookmark_id, owner_id)
    except AnnotationNotFoundError as exc:
        _raise_annotation_error(exc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/api/documents/{document_id}/highlights",
    response_model=HighlightListResponse,
)
async def document_highlights(
    document_id: UUID, session: SessionDependency, owner_id: OwnerDependency
) -> HighlightListResponse:
    try:
        highlights = await list_highlights(session, document_id, owner_id)
    except DocumentNotFoundError as exc:
        _raise_annotation_error(exc)
    return HighlightListResponse(
        items=[HighlightResponse.model_validate(highlight) for highlight in highlights]
    )


@router.post(
    "/api/documents/{document_id}/highlights",
    response_model=HighlightResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_document_highlight(
    document_id: UUID,
    payload: HighlightCreate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> HighlightResponse:
    try:
        highlight = await create_highlight(session, document_id, owner_id, payload)
    except (DocumentNotFoundError, AnnotationValidationError) as exc:
        _raise_annotation_error(exc)
    return HighlightResponse.model_validate(highlight)


@router.patch("/api/highlights/{highlight_id}", response_model=HighlightResponse)
async def edit_highlight(
    highlight_id: UUID,
    payload: HighlightUpdate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> HighlightResponse:
    try:
        highlight = await update_highlight(session, highlight_id, owner_id, payload)
    except AnnotationNotFoundError as exc:
        _raise_annotation_error(exc)
    return HighlightResponse.model_validate(highlight)


@router.delete("/api/highlights/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_highlight(
    highlight_id: UUID, session: SessionDependency, owner_id: OwnerDependency
) -> Response:
    try:
        await delete_highlight(session, highlight_id, owner_id)
    except AnnotationNotFoundError as exc:
        _raise_annotation_error(exc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/api/highlights/{highlight_id}/note",
    response_model=NoteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_note(
    highlight_id: UUID,
    payload: NoteCreate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> NoteResponse:
    if not payload.content.strip():
        raise HTTPException(status_code=422, detail="Note content must not be empty")
    try:
        note = await create_note(session, highlight_id, owner_id, payload.content)
    except (AnnotationNotFoundError, AnnotationConflictError) as exc:
        _raise_annotation_error(exc)
    return NoteResponse.model_validate(note)


@router.patch("/api/notes/{note_id}", response_model=NoteResponse)
async def edit_note(
    note_id: UUID,
    payload: NoteUpdate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> NoteResponse:
    if not payload.content.strip():
        raise HTTPException(status_code=422, detail="Note content must not be empty")
    try:
        note = await update_note(session, note_id, owner_id, payload.content)
    except AnnotationNotFoundError as exc:
        _raise_annotation_error(exc)
    return NoteResponse.model_validate(note)


@router.delete("/api/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_note(
    note_id: UUID, session: SessionDependency, owner_id: OwnerDependency
) -> Response:
    try:
        await delete_note(session, note_id, owner_id)
    except AnnotationNotFoundError as exc:
        _raise_annotation_error(exc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/users/me/reading-preferences", response_model=ReadingPreferenceResponse)
async def reading_preferences(
    session: SessionDependency, owner_id: OwnerDependency
) -> ReadingPreferenceResponse:
    preferences = await get_preferences(session, owner_id)
    if preferences is None:
        return ReadingPreferenceResponse()
    return ReadingPreferenceResponse.model_validate(preferences)


@router.put("/api/users/me/reading-preferences", response_model=ReadingPreferenceResponse)
async def save_reading_preferences(
    payload: ReadingPreferenceUpdate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> ReadingPreferenceResponse:
    preferences = await upsert_preferences(session, owner_id, payload)
    return ReadingPreferenceResponse.model_validate(preferences)

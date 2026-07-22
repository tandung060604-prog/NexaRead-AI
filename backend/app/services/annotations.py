from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.annotation import (
    Bookmark,
    Highlight,
    Note,
    ReadingProgress,
    UserReadingPreference,
)
from app.models.document import ContentBlock, Document, DocumentVersion
from app.schemas.annotation import (
    BookmarkCreate,
    HighlightCreate,
    HighlightUpdate,
    ProgressUpdate,
    ReadingPreferenceUpdate,
)
from app.services.documents import DocumentNotFoundError


class AnnotationNotFoundError(LookupError):
    pass


class AnnotationValidationError(ValueError):
    pass


class AnnotationConflictError(RuntimeError):
    pass


async def _get_owned_version(
    session: AsyncSession,
    document_id: UUID,
    version_id: UUID,
    user_id: str,
) -> DocumentVersion:
    version = await session.scalar(
        select(DocumentVersion)
        .join(Document, Document.id == DocumentVersion.document_id)
        .where(
            Document.id == document_id,
            Document.owner_id == user_id,
            Document.status.in_(("READABLE", "AI_READY")),
            DocumentVersion.id == version_id,
        )
    )
    if version is None:
        raise DocumentNotFoundError("Document version not found")
    return version


async def _get_owned_block(
    session: AsyncSession,
    document_id: UUID,
    version_id: UUID,
    block_id: UUID,
    user_id: str,
) -> ContentBlock:
    await _get_owned_version(session, document_id, version_id, user_id)
    block = await session.scalar(
        select(ContentBlock).where(
            ContentBlock.id == block_id,
            ContentBlock.document_version_id == version_id,
        )
    )
    if block is None:
        raise AnnotationValidationError("Content block does not belong to this document version")
    return block


async def get_progress(
    session: AsyncSession, document_id: UUID, user_id: str
) -> ReadingProgress | None:
    owned = await session.scalar(
        select(Document.id).where(Document.id == document_id, Document.owner_id == user_id)
    )
    if owned is None:
        raise DocumentNotFoundError("Document not found")
    value = await session.scalar(
        select(ReadingProgress).where(
            ReadingProgress.user_id == user_id,
            ReadingProgress.document_id == document_id,
        )
    )
    return value


async def upsert_progress(
    session: AsyncSession,
    document_id: UUID,
    user_id: str,
    payload: ProgressUpdate,
) -> ReadingProgress:
    await _get_owned_version(session, document_id, payload.document_version_id, user_id)
    if payload.last_block_id is not None:
        block = await _get_owned_block(
            session,
            document_id,
            payload.document_version_id,
            payload.last_block_id,
            user_id,
        )
        if block.page_number != payload.page_number:
            raise AnnotationValidationError("Progress page does not match the selected block")

    progress = await session.scalar(
        select(ReadingProgress).where(
            ReadingProgress.user_id == user_id,
            ReadingProgress.document_id == document_id,
        )
    )
    if progress is None:
        progress = ReadingProgress(
            user_id=user_id,
            document_id=document_id,
            document_version_id=payload.document_version_id,
        )
        session.add(progress)

    progress.document_version_id = payload.document_version_id
    progress.last_block_id = payload.last_block_id
    progress.page_number = payload.page_number
    progress.progress_percent = payload.progress_percent
    progress.scroll_offset = payload.scroll_offset
    progress.reading_mode = payload.reading_mode
    await session.commit()
    await session.refresh(progress)
    return progress


async def list_bookmarks(session: AsyncSession, document_id: UUID, user_id: str) -> list[Bookmark]:
    owned = await session.scalar(
        select(Document.id).where(Document.id == document_id, Document.owner_id == user_id)
    )
    if owned is None:
        raise DocumentNotFoundError("Document not found")
    bookmarks = await session.scalars(
        select(Bookmark)
        .where(Bookmark.document_id == document_id, Bookmark.user_id == user_id)
        .order_by(Bookmark.created_at)
    )
    return list(bookmarks)


async def create_bookmark(
    session: AsyncSession,
    document_id: UUID,
    user_id: str,
    payload: BookmarkCreate,
) -> Bookmark:
    block = await _get_owned_block(
        session,
        document_id,
        payload.document_version_id,
        payload.content_block_id,
        user_id,
    )
    existing = await session.scalar(
        select(Bookmark).where(
            Bookmark.user_id == user_id,
            Bookmark.content_block_id == block.id,
        )
    )
    if existing is not None:
        return existing

    title = (payload.title or block.text).strip()[:255] or f"Page {block.page_number}"
    bookmark = Bookmark(
        user_id=user_id,
        document_id=document_id,
        document_version_id=payload.document_version_id,
        content_block_id=block.id,
        page_number=block.page_number,
        title=title,
    )
    session.add(bookmark)
    await session.commit()
    await session.refresh(bookmark)
    return bookmark


async def delete_bookmark(session: AsyncSession, bookmark_id: UUID, user_id: str) -> None:
    bookmark = await session.scalar(
        select(Bookmark).where(Bookmark.id == bookmark_id, Bookmark.user_id == user_id)
    )
    if bookmark is None:
        raise AnnotationNotFoundError("Bookmark not found")
    await session.delete(bookmark)
    await session.commit()


async def list_highlights(
    session: AsyncSession, document_id: UUID, user_id: str
) -> list[Highlight]:
    owned = await session.scalar(
        select(Document.id).where(Document.id == document_id, Document.owner_id == user_id)
    )
    if owned is None:
        raise DocumentNotFoundError("Document not found")
    highlights = await session.scalars(
        select(Highlight)
        .options(selectinload(Highlight.note))
        .where(Highlight.document_id == document_id, Highlight.user_id == user_id)
        .order_by(Highlight.created_at)
    )
    return list(highlights)


async def create_highlight(
    session: AsyncSession,
    document_id: UUID,
    user_id: str,
    payload: HighlightCreate,
) -> Highlight:
    block = await _get_owned_block(
        session,
        document_id,
        payload.document_version_id,
        payload.content_block_id,
        user_id,
    )
    if payload.start_offset >= payload.end_offset or payload.end_offset > len(block.text):
        raise AnnotationValidationError("Highlight offsets are outside the content block")
    selected_text = block.text[payload.start_offset : payload.end_offset]
    if selected_text != payload.selected_text:
        raise AnnotationValidationError("Selected text does not match the content block")

    highlight = Highlight(
        user_id=user_id,
        document_id=document_id,
        document_version_id=payload.document_version_id,
        content_block_id=block.id,
        start_offset=payload.start_offset,
        end_offset=payload.end_offset,
        selected_text=selected_text,
        prefix_text=block.text[max(0, payload.start_offset - 50) : payload.start_offset],
        suffix_text=block.text[payload.end_offset : payload.end_offset + 50],
        color=payload.color,
        status="ACTIVE",
    )
    session.add(highlight)
    await session.commit()
    return await _get_highlight(session, highlight.id, user_id)


async def _get_highlight(session: AsyncSession, highlight_id: UUID, user_id: str) -> Highlight:
    highlight = await session.scalar(
        select(Highlight)
        .options(selectinload(Highlight.note))
        .where(Highlight.id == highlight_id, Highlight.user_id == user_id)
    )
    if highlight is None:
        raise AnnotationNotFoundError("Highlight not found")
    return highlight


async def update_highlight(
    session: AsyncSession,
    highlight_id: UUID,
    user_id: str,
    payload: HighlightUpdate,
) -> Highlight:
    highlight = await _get_highlight(session, highlight_id, user_id)
    if payload.color is not None:
        highlight.color = payload.color
    if payload.status is not None:
        highlight.status = payload.status
    await session.commit()
    return await _get_highlight(session, highlight.id, user_id)


async def delete_highlight(session: AsyncSession, highlight_id: UUID, user_id: str) -> None:
    highlight = await _get_highlight(session, highlight_id, user_id)
    await session.delete(highlight)
    await session.commit()


async def create_note(
    session: AsyncSession, highlight_id: UUID, user_id: str, content: str
) -> Note:
    highlight = await _get_highlight(session, highlight_id, user_id)
    if highlight.note is not None:
        raise AnnotationConflictError("This highlight already has a note")
    note = Note(user_id=user_id, highlight_id=highlight.id, content=content.strip())
    session.add(note)
    await session.commit()
    await session.refresh(note)
    return note


async def update_note(session: AsyncSession, note_id: UUID, user_id: str, content: str) -> Note:
    note = await session.scalar(select(Note).where(Note.id == note_id, Note.user_id == user_id))
    if note is None:
        raise AnnotationNotFoundError("Note not found")
    note.content = content.strip()
    await session.commit()
    await session.refresh(note)
    return note


async def delete_note(session: AsyncSession, note_id: UUID, user_id: str) -> None:
    note = await session.scalar(select(Note).where(Note.id == note_id, Note.user_id == user_id))
    if note is None:
        raise AnnotationNotFoundError("Note not found")
    await session.delete(note)
    await session.commit()


async def get_preferences(session: AsyncSession, user_id: str) -> UserReadingPreference | None:
    value = await session.scalar(
        select(UserReadingPreference).where(UserReadingPreference.user_id == user_id)
    )
    return value


async def upsert_preferences(
    session: AsyncSession,
    user_id: str,
    payload: ReadingPreferenceUpdate,
) -> UserReadingPreference:
    preferences = await get_preferences(session, user_id)
    if preferences is None:
        preferences = UserReadingPreference(user_id=user_id)
        session.add(preferences)
    preferences.theme = payload.theme
    preferences.font_size = payload.font_size
    preferences.line_height = payload.line_height
    preferences.reading_width = payload.reading_width
    preferences.font_family = payload.font_family
    preferences.focus_mode = payload.focus_mode
    await session.commit()
    await session.refresh(preferences)
    return preferences

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.annotation import Bookmark, Highlight, Note, ReadingProgress
from app.models.document import Collection, ContentBlock, Document
from app.schemas.dashboard import (
    DashboardBookmark,
    DashboardCollection,
    DashboardDocumentCard,
    DashboardNote,
    DashboardResponse,
    DashboardStats,
)
from app.services.personalization import get_reading_analytics

PROCESSING_STAGES = {
    "QUEUED",
    "SAFETY_CHECK",
    "EXTRACTING",
    "STRUCTURING",
    "READABLE",
    "TOC",
    "INDEXING",
}


def _document_type(document: Document) -> str:
    result = document.processing_result
    if result and isinstance(result.get("effective_document_type"), str):
        return str(result["effective_document_type"])
    return document.document_type_override or document.layout_type or document.source_type.upper()


async def get_dashboard(session: AsyncSession, user_id: str) -> DashboardResponse:
    analytics = await get_reading_analytics(session, user_id)
    documents = list(
        await session.scalars(
            select(Document)
            .options(
                selectinload(Document.versions),
                selectinload(Document.processing_jobs),
            )
            .where(Document.owner_id == user_id)
            .order_by(Document.created_at.desc())
        )
    )
    progress_items = list(
        await session.scalars(
            select(ReadingProgress).where(ReadingProgress.user_id == user_id)
        )
    )
    progress_by_document = {item.document_id: item for item in progress_items}
    block_ids = [item.last_block_id for item in progress_items if item.last_block_id]
    blocks = (
        list(
            await session.scalars(
                select(ContentBlock).where(ContentBlock.id.in_(block_ids))
            )
        )
        if block_ids
        else []
    )
    blocks_by_id = {block.id: block for block in blocks}
    version_ids = {block.document_version_id for block in blocks}
    headings = (
        list(
            await session.scalars(
                select(ContentBlock)
                .where(
                    ContentBlock.document_version_id.in_(version_ids),
                    ContentBlock.block_type.in_(
                        ("HEADING_1", "HEADING_2", "HEADING_3")
                    ),
                )
                .order_by(
                    ContentBlock.document_version_id,
                    ContentBlock.sequence_number,
                )
            )
        )
        if version_ids
        else []
    )
    headings_by_version: dict[object, list[ContentBlock]] = {}
    for heading in headings:
        headings_by_version.setdefault(heading.document_version_id, []).append(heading)

    cards: list[DashboardDocumentCard] = []
    for document in documents:
        progress = progress_by_document.get(document.id)
        block = (
            blocks_by_id.get(progress.last_block_id)
            if progress and progress.last_block_id is not None
            else None
        )
        last_chapter = None
        if block is not None:
            prior_headings = (
                heading
                for heading in headings_by_version.get(
                    block.document_version_id,
                    [],
                )
                if heading.sequence_number <= block.sequence_number
            )
            chapter = max(
                prior_headings,
                key=lambda heading: heading.sequence_number,
                default=None,
            )
            if chapter is not None:
                last_chapter = chapter.display_text
        latest_job = document.processing_jobs[-1] if document.processing_jobs else None
        cards.append(
            DashboardDocumentCard(
                id=document.id,
                title=document.title,
                source_type=document.source_type,
                document_type=_document_type(document),
                created_at=document.created_at,
                progress_percent=progress.progress_percent if progress else 0,
                last_chapter=last_chapter,
                last_read_at=progress.updated_at if progress else document.last_read_at,
                status=document.status,
                processing_status=latest_job.status if latest_job else None,
                processing_progress=latest_job.progress if latest_job else 0,
                cover_url=f"/api/documents/{document.id}/cover",
            )
        )

    bookmark_rows = (
        await session.execute(
            select(Bookmark, Document.title)
            .join(Document, Document.id == Bookmark.document_id)
            .where(Bookmark.user_id == user_id, Document.owner_id == user_id)
            .order_by(Bookmark.created_at.desc())
            .limit(6)
        )
    ).all()
    note_rows = (
        await session.execute(
            select(Note, Highlight, Document.title)
            .join(Highlight, Highlight.id == Note.highlight_id)
            .join(Document, Document.id == Highlight.document_id)
            .where(Note.user_id == user_id, Document.owner_id == user_id)
            .order_by(Note.updated_at.desc())
            .limit(6)
        )
    ).all()
    bookmark_count = int(
        await session.scalar(
            select(func.count()).select_from(Bookmark).where(Bookmark.user_id == user_id)
        )
        or 0
    )
    note_count = int(
        await session.scalar(
            select(func.count()).select_from(Note).where(Note.user_id == user_id)
        )
        or 0
    )
    collections = list(
        await session.scalars(
            select(Collection)
            .where(Collection.owner_id == user_id)
            .options(selectinload(Collection.documents))
            .order_by(Collection.name)
        )
    )

    continue_reading = sorted(
        [
            card
            for card in cards
            if 0 < card.progress_percent < 100
            and card.status in {"READABLE", "AI_READY"}
        ],
        key=lambda card: card.last_read_at or card.created_at,
        reverse=True,
    )[:6]
    processing = [
        card
        for card in cards
        if card.processing_status in PROCESSING_STAGES
        or card.status in PROCESSING_STAGES
    ][:6]
    completed = [card for card in cards if card.progress_percent >= 100][:6]
    return DashboardResponse(
        continue_reading=continue_reading,
        recent_documents=cards[:8],
        processing_documents=processing,
        completed_documents=completed,
        collections=[
            DashboardCollection(
                id=collection.id,
                name=collection.name,
                document_count=sum(
                    document.archived_at is None
                    for document in collection.documents
                ),
            )
            for collection in collections
        ],
        recent_bookmarks=[
            DashboardBookmark(
                id=bookmark.id,
                document_id=bookmark.document_id,
                document_title=document_title,
                title=bookmark.title,
                page_number=bookmark.page_number,
                created_at=bookmark.created_at,
            )
            for bookmark, document_title in bookmark_rows
        ],
        recent_notes=[
            DashboardNote(
                id=note.id,
                document_id=highlight.document_id,
                document_title=document_title,
                content=note.content,
                selected_text=highlight.selected_text,
                updated_at=note.updated_at,
            )
            for note, highlight, document_title in note_rows
        ],
        stats=DashboardStats(
            total_documents=len(cards),
            in_progress_documents=len(continue_reading),
            completed_documents=len(
                [card for card in cards if card.progress_percent >= 100]
            ),
            bookmark_count=bookmark_count,
            note_count=note_count,
            analytics_enabled=analytics.enabled,
            reading_time_seconds=analytics.total_reading_seconds,
            reading_streak_days=analytics.reading_streak_days,
            source_pages_reached=analytics.source_pages_reached,
        ),
    )

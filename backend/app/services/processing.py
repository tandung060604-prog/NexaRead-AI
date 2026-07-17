import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.db.session import async_session_factory
from app.models.document import ContentBlock, Document, DocumentVersion, Page, ProcessingJob
from app.services.keyword_detection import detect_keywords_for_version
from app.services.pdf_parser import ParsedPdf, PdfNeedsOcrError, PdfParseError, parse_pdf
from app.services.storage import StorageError, StorageService, get_storage_service

logger = logging.getLogger(__name__)

SessionFactory = async_sessionmaker[AsyncSession]
Parser = Callable[[bytes], ParsedPdf]


def parse_pdf_with_settings(pdf_bytes: bytes) -> ParsedPdf:
    return parse_pdf(
        pdf_bytes,
        minimum_text_characters=get_settings().min_extracted_text_characters,
    )


async def _load_entities(
    session: AsyncSession, document_id: UUID, version_id: UUID, job_id: UUID
) -> tuple[Document, DocumentVersion, ProcessingJob] | None:
    result = await session.execute(
        select(Document, DocumentVersion, ProcessingJob)
        .join(DocumentVersion, DocumentVersion.document_id == Document.id)
        .join(ProcessingJob, ProcessingJob.document_id == Document.id)
        .where(
            Document.id == document_id,
            DocumentVersion.id == version_id,
            ProcessingJob.id == job_id,
            ProcessingJob.document_version_id == version_id,
        )
    )
    row = result.one_or_none()
    if row is None:
        return None
    return row[0], row[1], row[2]


async def _set_stage(
    session: AsyncSession,
    document: Document,
    job: ProcessingJob,
    stage: str,
    progress: int,
) -> None:
    document.status = stage
    job.status = stage
    job.progress = progress
    job.error_code = None
    job.error_message = None
    if job.started_at is None:
        job.started_at = datetime.now(UTC)
    await session.commit()


async def _clear_extraction(session: AsyncSession, version_id: UUID) -> None:
    await session.execute(
        delete(ContentBlock).where(ContentBlock.document_version_id == version_id)
    )
    await session.execute(delete(Page).where(Page.document_version_id == version_id))


async def _finish_without_content(
    session: AsyncSession,
    document: Document,
    version: DocumentVersion,
    job: ProcessingJob,
    status: str,
    error_code: str,
) -> None:
    await _clear_extraction(session, version.id)
    version.page_count = None
    version.pdf_metadata = {}
    version.pdf_outline = []
    document.status = status
    job.status = status
    job.progress = 100
    job.error_code = error_code
    job.error_message = (
        "This PDF requires OCR, which is not supported yet."
        if status == "OCR_REQUIRED"
        else "The PDF could not be processed."
    )
    job.completed_at = datetime.now(UTC)
    await session.commit()


async def _replace_extraction(
    session: AsyncSession,
    document: Document,
    version: DocumentVersion,
    job: ProcessingJob,
    parsed: ParsedPdf,
) -> None:
    await _clear_extraction(session, version.id)
    page_ids: dict[int, UUID] = {}
    for parsed_page in parsed.pages:
        page_id = uuid4()
        page_ids[parsed_page.page_number] = page_id
        session.add(
            Page(
                id=page_id,
                document_version_id=version.id,
                page_number=parsed_page.page_number,
                width=parsed_page.width,
                height=parsed_page.height,
                text=parsed_page.text,
                word_count=parsed_page.word_count,
            )
        )

    block_ids = {block.sequence_number: uuid4() for block in parsed.blocks}
    for block in parsed.blocks:
        parent_id = (
            block_ids.get(block.parent_sequence_number)
            if block.parent_sequence_number is not None
            else None
        )
        session.add(
            ContentBlock(
                id=block_ids[block.sequence_number],
                document_version_id=version.id,
                page_id=page_ids[block.page_number],
                parent_block_id=parent_id,
                sequence_number=block.sequence_number,
                block_type=block.block_type.value,
                text=block.text,
                page_number=block.page_number,
                chapter_index=block.chapter_index,
                section_index=block.section_index,
                paragraph_index=block.paragraph_index,
                start_offset=block.start_offset,
                end_offset=block.end_offset,
                bounding_box=block.bounding_box,
                font_name=block.font_name,
                font_size=block.font_size,
                is_bold=block.is_bold,
                is_italic=block.is_italic,
                confidence=block.confidence,
                block_metadata=block.metadata,
                content_hash=block.content_hash,
            )
        )

    await session.flush()
    await detect_keywords_for_version(session, document.id, version.id)

    version.page_count = parsed.page_count
    version.pdf_metadata = parsed.metadata
    version.pdf_outline = parsed.outline
    document.status = "READABLE"
    job.status = "READABLE"
    job.progress = 100
    job.error_code = None
    job.error_message = None
    job.completed_at = datetime.now(UTC)
    await session.commit()


async def process_document_version(
    document_id: UUID,
    version_id: UUID,
    job_id: UUID,
    *,
    storage: StorageService | None = None,
    session_factory: SessionFactory = async_session_factory,
    parser: Parser = parse_pdf_with_settings,
) -> None:
    storage = storage or get_storage_service()
    async with session_factory() as session:
        entities = await _load_entities(session, document_id, version_id, job_id)
        if entities is None:
            return
        document, version, job = entities
        await _set_stage(session, document, job, "EXTRACTING", 15)
        try:
            pdf_bytes = await storage.download(version.storage_key)
            parsed = await asyncio.to_thread(parser, pdf_bytes)
        except PdfNeedsOcrError as exc:
            await _finish_without_content(session, document, version, job, "OCR_REQUIRED", exc.code)
            return
        except PdfParseError as exc:
            await _finish_without_content(session, document, version, job, "FAILED", exc.code)
            return

        await _set_stage(session, document, job, "STRUCTURING", 65)
        try:
            await _replace_extraction(session, document, version, job, parsed)
        except SQLAlchemyError:
            await session.rollback()
            raise


async def mark_processing_failed(
    document_id: UUID,
    version_id: UUID,
    job_id: UUID,
    *,
    session_factory: SessionFactory = async_session_factory,
) -> None:
    async with session_factory() as session:
        entities = await _load_entities(session, document_id, version_id, job_id)
        if entities is None:
            return
        document, _, job = entities
        document.status = "FAILED"
        job.status = "FAILED"
        job.progress = 100
        job.error_code = "PROCESSING_FAILED"
        job.error_message = "The PDF could not be processed."
        job.completed_at = datetime.now(UTC)
        try:
            await session.commit()
        except (SQLAlchemyError, StorageError):
            await session.rollback()
            logger.exception("Could not persist processing failure state")

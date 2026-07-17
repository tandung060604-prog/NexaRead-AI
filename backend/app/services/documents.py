import hashlib
import logging
import re
from dataclasses import dataclass
from pathlib import PurePosixPath
from uuid import UUID, uuid4

from fastapi import UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.document import Document, DocumentVersion, ProcessingJob
from app.services.queue import DocumentQueue, QueueError
from app.services.storage import StorageError, StorageService

logger = logging.getLogger(__name__)


class DocumentValidationError(ValueError):
    pass


class DocumentNotFoundError(LookupError):
    pass


class DocumentStorageError(RuntimeError):
    pass


class DocumentPersistenceError(RuntimeError):
    pass


class DocumentQueueError(RuntimeError):
    pass


@dataclass(frozen=True)
class ValidatedPdf:
    data: bytes
    display_filename: str
    title: str
    content_hash: str


def sanitize_filename(filename: str) -> str:
    leaf_name = PurePosixPath(filename.replace("\\", "/")).name
    sanitized = re.sub(r"[\x00-\x1f\x7f]", "", leaf_name)
    sanitized = " ".join(sanitized.split()).strip(" .")
    if not sanitized:
        sanitized = "document.pdf"
    if len(sanitized) > 255:
        sanitized = f"{sanitized[:251].rstrip()}.pdf"
    return sanitized


async def validate_pdf_upload(file: UploadFile, max_size_bytes: int) -> ValidatedPdf:
    if not file.filename:
        raise DocumentValidationError("A PDF file is required")

    display_filename = sanitize_filename(file.filename)
    if not display_filename.lower().endswith(".pdf"):
        raise DocumentValidationError("Only PDF files are supported")

    data = bytearray()
    while chunk := await file.read(1024 * 1024):
        data.extend(chunk)
        if len(data) > max_size_bytes:
            raise DocumentValidationError("PDF exceeds the configured upload size limit")

    if not data:
        raise DocumentValidationError("PDF file must not be empty")
    if not data.startswith(b"%PDF-"):
        raise DocumentValidationError("File content is not a valid PDF")

    pdf_bytes = bytes(data)
    title = display_filename[:-4].strip() or "Untitled document"
    return ValidatedPdf(
        data=pdf_bytes,
        display_filename=display_filename,
        title=title,
        content_hash=hashlib.sha256(pdf_bytes).hexdigest(),
    )


async def create_document(
    session: AsyncSession,
    storage: StorageService,
    queue: DocumentQueue,
    file: UploadFile,
    owner_id: str,
    max_size_bytes: int,
) -> Document:
    validated = await validate_pdf_upload(file, max_size_bytes)
    document_id = uuid4()
    version_id = uuid4()
    storage_key = f"documents/{document_id}/versions/{version_id}/original.pdf"

    try:
        await storage.upload(storage_key, validated.data, "application/pdf")
    except StorageError as exc:
        await session.rollback()
        raise DocumentStorageError("Document storage is unavailable") from exc

    document = Document(
        id=document_id,
        owner_id=owner_id,
        title=validated.title,
        original_filename=validated.display_filename,
        source_type="pdf",
        mime_type="application/pdf",
        file_size=len(validated.data),
        status="QUEUED",
        versions=[
            DocumentVersion(
                id=version_id,
                version_number=1,
                storage_key=storage_key,
                content_hash=validated.content_hash,
            )
        ],
        processing_jobs=[
            ProcessingJob(
                document_version_id=version_id,
                job_type="document_processing",
                status="QUEUED",
                progress=0,
            )
        ],
    )
    session.add(document)

    try:
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        try:
            await storage.delete(storage_key)
        except StorageError:
            logger.exception("Failed to remove uploaded object after database rollback")
        raise DocumentPersistenceError("Could not save document metadata") from exc

    try:
        await queue.enqueue(document_id, version_id, document.processing_jobs[0].id)
    except QueueError as exc:
        document.status = "FAILED"
        job = document.processing_jobs[0]
        job.status = "FAILED"
        job.progress = 100
        job.error_code = "QUEUE_UNAVAILABLE"
        job.error_message = "Document processing could not be queued."
        try:
            await session.commit()
        except SQLAlchemyError as persistence_exc:
            await session.rollback()
            raise DocumentPersistenceError(
                "Could not save queue failure state"
            ) from persistence_exc
        raise DocumentQueueError("Document processing queue is unavailable") from exc

    return await get_document(session, document_id, owner_id)


async def list_documents(
    session: AsyncSession, owner_id: str, limit: int, offset: int
) -> tuple[list[Document], int]:
    filters = Document.owner_id == owner_id
    total = await session.scalar(select(func.count()).select_from(Document).where(filters))
    result = await session.scalars(
        select(Document)
        .where(filters)
        .order_by(Document.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result), int(total or 0)


async def get_document(session: AsyncSession, document_id: UUID, owner_id: str) -> Document:
    document = await session.scalar(
        select(Document)
        .where(Document.id == document_id, Document.owner_id == owner_id)
        .options(
            selectinload(Document.versions),
            selectinload(Document.processing_jobs),
        )
    )
    if document is None:
        raise DocumentNotFoundError("Document not found")
    return document


async def rename_document(
    session: AsyncSession, document_id: UUID, owner_id: str, title: str
) -> Document:
    document = await get_document(session, document_id, owner_id)
    document.title = title
    try:
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise DocumentPersistenceError("Could not rename document") from exc
    return await get_document(session, document_id, owner_id)


async def delete_document(
    session: AsyncSession,
    storage: StorageService,
    document_id: UUID,
    owner_id: str,
) -> None:
    document = await get_document(session, document_id, owner_id)
    try:
        for version in document.versions:
            await storage.delete(version.storage_key)
    except StorageError as exc:
        await session.rollback()
        raise DocumentStorageError("Stored document could not be deleted") from exc

    try:
        await session.execute(
            delete(Document).where(Document.id == document_id, Document.owner_id == owner_id)
        )
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise DocumentPersistenceError("Could not delete document metadata") from exc

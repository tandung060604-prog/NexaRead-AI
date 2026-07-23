import hashlib
import logging
import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath
from uuid import UUID, uuid4
from zipfile import BadZipFile, ZipFile

from fastapi import UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.document import Collection, Document, DocumentVersion, ProcessingJob
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


class DocumentAlreadyProcessingError(RuntimeError):
    pass


_SOURCE_MIME = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "epub": "application/epub+zip",
}
_EXTENSION_SOURCE = {".pdf": "pdf", ".docx": "docx", ".epub": "epub"}
_EXECUTABLE_SIGNATURES = (b"MZ", b"\x7fELF", b"#!")
_DOCUMENT_TYPES = {
    "BOOK",
    "TEXTBOOK",
    "LECTURE",
    "RESEARCH_PAPER",
    "THESIS",
    "TECHNICAL",
    "REPORT",
    "LEGAL",
    "WORK",
    "WEB_ARTICLE",
    "OTHER",
}


@dataclass(frozen=True)
class ValidatedDocument:
    data: bytes
    display_filename: str
    title: str
    content_hash: str
    source_type: str
    mime_type: str
    extension: str


ValidatedPdf = ValidatedDocument


def sanitize_filename(filename: str) -> str:
    leaf_name = PurePosixPath(filename.replace("\\", "/")).name
    sanitized = re.sub(r"[\x00-\x1f\x7f]", "", leaf_name)
    sanitized = " ".join(sanitized.split()).strip(" .")
    if not sanitized:
        sanitized = "document"
    if len(sanitized) > 255:
        suffix = PurePosixPath(sanitized).suffix[:16]
        sanitized = f"{sanitized[: 255 - len(suffix)].rstrip()}{suffix}"
    return sanitized


def _inspect_zip(data: bytes, max_size_bytes: int) -> set[str]:
    try:
        with ZipFile(BytesIO(data)) as archive:
            infos = archive.infolist()
            if len(infos) > 10_000:
                raise DocumentValidationError("Archive contains too many files")
            total_size = sum(info.file_size for info in infos)
            compressed_size = max(1, sum(info.compress_size for info in infos))
            if total_size > max(max_size_bytes * 5, 100 * 1024 * 1024):
                raise DocumentValidationError("Archive expands beyond the safe size limit")
            if total_size / compressed_size > 200:
                raise DocumentValidationError("Archive compression ratio is unsafe")
            if any(info.flag_bits & 0x1 for info in infos):
                raise DocumentValidationError("Encrypted archives are not supported")
            return {info.filename.replace("\\", "/") for info in infos}
    except BadZipFile as exc:
        raise DocumentValidationError("File content is not a valid document archive") from exc


def _sniff_source_type(data: bytes, max_size_bytes: int) -> str:
    if data.startswith(_EXECUTABLE_SIGNATURES):
        raise DocumentValidationError("Executable uploads are not allowed")
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"PK\x03\x04"):
        names = _inspect_zip(data, max_size_bytes)
        if "word/document.xml" in names and "[Content_Types].xml" in names:
            return "docx"
        if "mimetype" in names and "META-INF/container.xml" in names:
            try:
                with ZipFile(BytesIO(data)) as archive:
                    if archive.read("mimetype").strip() == b"application/epub+zip":
                        return "epub"
            except (BadZipFile, KeyError) as exc:
                raise DocumentValidationError("File content is not a valid EPUB") from exc
    raise DocumentValidationError("File content is not a supported PDF, DOCX, or EPUB")


async def validate_document_upload(file: UploadFile, max_size_bytes: int) -> ValidatedDocument:
    if not file.filename:
        raise DocumentValidationError("A PDF, DOCX, or EPUB file is required")
    display_filename = sanitize_filename(file.filename)
    extension = PurePosixPath(display_filename).suffix.casefold()
    expected_source = _EXTENSION_SOURCE.get(extension)
    if expected_source is None:
        raise DocumentValidationError("Only PDF, DOCX, and EPUB files are supported")

    data = bytearray()
    while chunk := await file.read(1024 * 1024):
        data.extend(chunk)
        if len(data) > max_size_bytes:
            raise DocumentValidationError("Document exceeds the configured upload size limit")
    if not data:
        raise DocumentValidationError(f"{expected_source.upper()} file must not be empty")

    document_bytes = bytes(data)
    try:
        detected_source = _sniff_source_type(document_bytes, max_size_bytes)
    except DocumentValidationError as exc:
        if expected_source == "pdf" and str(exc).startswith("File content is not a supported"):
            raise DocumentValidationError("File content is not a valid PDF") from exc
        raise
    if detected_source != expected_source:
        if expected_source == "pdf":
            raise DocumentValidationError("File content is not a valid PDF")
        raise DocumentValidationError("File extension does not match its detected content type")
    title = display_filename[: -len(extension)].strip() or "Untitled document"
    return ValidatedDocument(
        data=document_bytes,
        display_filename=display_filename,
        title=title,
        content_hash=hashlib.sha256(document_bytes).hexdigest(),
        source_type=detected_source,
        mime_type=_SOURCE_MIME[detected_source],
        extension=extension,
    )


async def validate_pdf_upload(file: UploadFile, max_size_bytes: int) -> ValidatedDocument:
    validated = await validate_document_upload(file, max_size_bytes)
    if validated.source_type != "pdf":
        raise DocumentValidationError("Only PDF files are supported")
    return validated


async def create_document(
    session: AsyncSession,
    storage: StorageService,
    queue: DocumentQueue,
    file: UploadFile,
    owner_id: str,
    max_size_bytes: int,
    *,
    document_type_override: str | None = None,
    collection_id: UUID | None = None,
) -> Document:
    document_type_override, collection_id = await validate_document_metadata(
        session,
        owner_id,
        document_type_override=document_type_override,
        collection_id=collection_id,
    )
    validated = await validate_document_upload(file, max_size_bytes)
    document_id = uuid4()
    version_id = uuid4()
    storage_key = f"documents/{document_id}/versions/{version_id}/original{validated.extension}"

    try:
        await storage.upload(storage_key, validated.data, validated.mime_type)
    except StorageError as exc:
        await session.rollback()
        raise DocumentStorageError("Document storage is unavailable") from exc

    document = Document(
        id=document_id,
        owner_id=owner_id,
        title=validated.title,
        original_filename=validated.display_filename,
        source_type=validated.source_type,
        mime_type=validated.mime_type,
        file_size=len(validated.data),
        collection_id=collection_id,
        layout_type=(
            layout_type_for_document_type(document_type_override)
            if document_type_override
            else "GENERAL_DOCUMENT"
        ),
        document_type_override=document_type_override,
        status="SAFETY_CHECK",
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
                status="SAFETY_CHECK",
                progress=10,
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
            selectinload(Document.collection),
            selectinload(Document.tags),
        )
    )
    if document is None:
        raise DocumentNotFoundError("Document not found")
    return document


async def rename_document(
    session: AsyncSession,
    document_id: UUID,
    owner_id: str,
    title: str | None,
    layout_override: str | None = None,
) -> Document:
    document = await get_document(session, document_id, owner_id)
    if title is not None:
        document.title = title
    if layout_override is not None:
        document.layout_override = layout_override
    try:
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise DocumentPersistenceError("Could not update document") from exc
    return await get_document(session, document_id, owner_id)


def layout_type_for_document_type(document_type: str) -> str:
    if document_type in {"BOOK", "TEXTBOOK"}:
        return "BOOK"
    if document_type in {"RESEARCH_PAPER", "THESIS"}:
        return "PAPER"
    if document_type == "TECHNICAL":
        return "TECHNICAL_DOCUMENTATION"
    if document_type == "WEB_ARTICLE":
        return "BLOG_ARTICLE"
    return "GENERAL_DOCUMENT"


async def validate_document_metadata(
    session: AsyncSession,
    owner_id: str,
    *,
    document_type_override: str | None,
    collection_id: UUID | None,
) -> tuple[str | None, UUID | None]:
    normalized_document_type = None
    if document_type_override is not None:
        normalized_document_type = document_type_override.strip().upper()
        if normalized_document_type not in _DOCUMENT_TYPES:
            raise DocumentValidationError("Unsupported document type")
    if collection_id is not None:
        owned_collection_id = await session.scalar(
            select(Collection.id).where(
                Collection.id == collection_id,
                Collection.owner_id == owner_id,
            )
        )
        if owned_collection_id is None:
            raise DocumentValidationError("Collection not found")
    return normalized_document_type, collection_id


async def set_document_type_override(
    session: AsyncSession,
    document_id: UUID,
    owner_id: str,
    document_type_override: str | None,
) -> Document:
    document = await get_document(session, document_id, owner_id)
    document.document_type_override = document_type_override
    latest_metadata = (
        max(document.versions, key=lambda version: version.version_number).pdf_metadata
        if document.versions
        else {}
    )
    detected_type = latest_metadata.get("document_type")
    effective_type = document_type_override or (
        detected_type if isinstance(detected_type, str) else "OTHER"
    )
    document.layout_type = document.layout_override or layout_type_for_document_type(
        effective_type
    )
    try:
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise DocumentPersistenceError("Could not update document type") from exc
    return await get_document(session, document_id, owner_id)


async def reprocess_document(
    session: AsyncSession,
    storage: StorageService,
    queue: DocumentQueue,
    document_id: UUID,
    owner_id: str,
) -> Document:
    document = await get_document(session, document_id, owner_id)
    if not document.versions:
        raise DocumentValidationError("Document has no source version")
    latest_version = max(document.versions, key=lambda version: version.version_number)
    active_statuses = {
        "QUEUED",
        "SAFETY_CHECK",
        "EXTRACTING",
        "STRUCTURING",
        "READABLE",
        "TOC",
        "INDEXING",
    }
    if any(
        job.document_version_id == latest_version.id and job.status in active_statuses
        for job in document.processing_jobs
    ):
        raise DocumentAlreadyProcessingError("Document is already being processed")

    new_version_id = uuid4()
    new_job_id = uuid4()
    source_suffix = PurePosixPath(latest_version.storage_key).suffix or ".bin"
    new_storage_key = (
        f"documents/{document.id}/versions/{new_version_id}/original{source_suffix}"
    )
    try:
        source_data = await storage.download(latest_version.storage_key)
        await storage.upload(new_storage_key, source_data, document.mime_type)
    except StorageError as exc:
        await session.rollback()
        raise DocumentStorageError("Stored document could not be copied") from exc

    new_version = DocumentVersion(
        id=new_version_id,
        document_id=document.id,
        version_number=latest_version.version_number + 1,
        storage_key=new_storage_key,
        content_hash=latest_version.content_hash,
    )
    new_job = ProcessingJob(
        id=new_job_id,
        document_id=document.id,
        document_version_id=new_version_id,
        job_type="document_reprocessing",
        status="SAFETY_CHECK",
        progress=10,
    )
    document.versions.append(new_version)
    document.processing_jobs.append(new_job)
    document.status = "SAFETY_CHECK"
    try:
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        try:
            await storage.delete(new_storage_key)
        except StorageError:
            logger.exception("Failed to remove copied source after reprocess rollback")
        raise DocumentPersistenceError("Could not create reprocessing version") from exc

    try:
        await queue.enqueue(document.id, new_version_id, new_job_id)
    except QueueError as exc:
        document.status = "FAILED"
        new_job.status = "FAILED"
        new_job.progress = 100
        new_job.error_code = "QUEUE_UNAVAILABLE"
        new_job.error_message = "Document reprocessing could not be queued."
        try:
            await session.commit()
        except SQLAlchemyError as persistence_exc:
            await session.rollback()
            raise DocumentPersistenceError(
                "Could not save reprocessing queue failure"
            ) from persistence_exc
        raise DocumentQueueError("Document reprocessing queue is unavailable") from exc
    return await get_document(session, document.id, owner_id)


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
            if version.cover_storage_key:
                await storage.delete(version.cover_storage_key)
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

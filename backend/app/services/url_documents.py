from __future__ import annotations

import hashlib
import logging
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from bs4 import BeautifulSoup
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.document import Document, DocumentVersion, ProcessingJob
from app.services.documents import (
    DocumentPersistenceError,
    DocumentQueueError,
    DocumentStorageError,
    DocumentValidationError,
    get_document,
    layout_type_for_document_type,
    sanitize_filename,
    validate_document_metadata,
)
from app.services.queue import DocumentQueue, QueueError
from app.services.storage import StorageError, StorageService
from app.services.url_import import UrlImportError, fetch_url

logger = logging.getLogger(__name__)


async def create_url_document(
    session: AsyncSession,
    storage: StorageService,
    queue: DocumentQueue,
    url: str,
    owner_id: str,
    settings: Settings,
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
    try:
        fetched = await fetch_url(
            url,
            max_bytes=settings.url_import_max_bytes,
            timeout_seconds=settings.url_import_timeout_seconds,
            max_redirects=settings.url_import_max_redirects,
        )
    except UrlImportError as exc:
        raise DocumentValidationError(str(exc)) from exc

    soup = BeautifulSoup(fetched.data, "html.parser")
    html_title = " ".join((soup.title.get_text(" ", strip=True) if soup.title else "").split())
    host = urlsplit(fetched.final_url).hostname or "web-import"
    title = html_title[:255] or host
    filename = sanitize_filename(f"{host}.html")
    document_id = uuid4()
    version_id = uuid4()
    storage_key = f"documents/{document_id}/versions/{version_id}/original.html"
    try:
        await storage.upload(storage_key, fetched.data, fetched.content_type)
    except StorageError as exc:
        raise DocumentStorageError("Document storage is unavailable") from exc

    document = Document(
        id=document_id,
        owner_id=owner_id,
        title=title,
        original_filename=filename,
        source_type="url",
        source_url=fetched.final_url,
        mime_type=fetched.content_type,
        file_size=len(fetched.data),
        collection_id=collection_id,
        layout_type=layout_type_for_document_type(
            document_type_override or "WEB_ARTICLE"
        ),
        document_type_override=document_type_override,
        status="SAFETY_CHECK",
        versions=[
            DocumentVersion(
                id=version_id,
                version_number=1,
                storage_key=storage_key,
                content_hash=hashlib.sha256(fetched.data).hexdigest(),
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
            logger.exception("Failed to remove imported URL object after database rollback")
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

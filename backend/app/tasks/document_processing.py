import asyncio
from uuid import UUID

import dramatiq

from app.services.processing import mark_processing_failed, process_document_version
from app.tasks.broker import broker as broker


@dramatiq.actor(
    queue_name="document-processing",
    max_retries=3,
    min_backoff=1000,
    max_backoff=30000,
    time_limit=300000,
)
def process_document(document_id: str, version_id: str, job_id: str) -> None:
    identifiers = (UUID(document_id), UUID(version_id), UUID(job_id))
    try:
        asyncio.run(process_document_version(*identifiers))
    except Exception:
        asyncio.run(mark_processing_failed(*identifiers))
        raise

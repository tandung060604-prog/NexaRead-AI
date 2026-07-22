import asyncio
from uuid import UUID

import dramatiq

from app.db.session import dispose_database_engine
from app.services.processing import mark_processing_failed, process_document_version
from app.tasks.broker import broker as broker


async def _run_document_processing(identifiers: tuple[UUID, UUID, UUID]) -> None:
    try:
        await process_document_version(*identifiers)
    except Exception:
        await mark_processing_failed(*identifiers)
        raise
    finally:
        await dispose_database_engine()


@dramatiq.actor(
    queue_name="document-processing",
    max_retries=3,
    min_backoff=1000,
    max_backoff=30000,
    time_limit=300000,
)
def process_document(document_id: str, version_id: str, job_id: str) -> None:
    identifiers = (UUID(document_id), UUID(version_id), UUID(job_id))
    asyncio.run(_run_document_processing(identifiers))

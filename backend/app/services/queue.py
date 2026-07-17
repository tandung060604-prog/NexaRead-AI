import asyncio
from abc import ABC, abstractmethod
from functools import lru_cache
from uuid import UUID


class QueueError(RuntimeError):
    pass


class DocumentQueue(ABC):
    @abstractmethod
    async def enqueue(self, document_id: UUID, version_id: UUID, job_id: UUID) -> None:
        raise NotImplementedError


class DramatiqDocumentQueue(DocumentQueue):
    async def enqueue(self, document_id: UUID, version_id: UUID, job_id: UUID) -> None:
        from app.tasks.document_processing import process_document

        try:
            await asyncio.to_thread(
                process_document.send, str(document_id), str(version_id), str(job_id)
            )
        except Exception as exc:
            raise QueueError("Document processing queue is unavailable") from exc


@lru_cache
def get_document_queue() -> DocumentQueue:
    return DramatiqDocumentQueue()

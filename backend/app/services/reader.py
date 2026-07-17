from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import ContentBlock, Document, DocumentVersion, Page, ProcessingJob
from app.services.documents import DocumentNotFoundError
from app.services.storage import StorageService


class DocumentNotReadableError(RuntimeError):
    def __init__(self, document_status: str) -> None:
        super().__init__("Document is not readable")
        self.document_status = document_status


@dataclass(frozen=True)
class ProcessingStatus:
    document_id: UUID
    status: str
    stage: str
    progress: int
    error_code: str | None
    error_message: str | None
    page_count: int | None


async def _get_owned_version(
    session: AsyncSession, document_id: UUID, owner_id: str
) -> tuple[Document, DocumentVersion]:
    result = await session.execute(
        select(Document, DocumentVersion)
        .join(DocumentVersion, DocumentVersion.document_id == Document.id)
        .where(Document.id == document_id, Document.owner_id == owner_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    row = result.one_or_none()
    if row is None:
        raise DocumentNotFoundError("Document not found")
    return row[0], row[1]


def _require_readable(document: Document) -> None:
    if document.status != "READABLE":
        raise DocumentNotReadableError(document.status)


async def get_processing_status(
    session: AsyncSession, document_id: UUID, owner_id: str
) -> ProcessingStatus:
    document, version = await _get_owned_version(session, document_id, owner_id)
    job = await session.scalar(
        select(ProcessingJob)
        .where(
            ProcessingJob.document_id == document.id,
            ProcessingJob.document_version_id == version.id,
        )
        .order_by(ProcessingJob.created_at.desc())
        .limit(1)
    )
    return ProcessingStatus(
        document_id=document.id,
        status=document.status,
        stage=job.status if job else document.status,
        progress=job.progress if job else 0,
        error_code=job.error_code if job else None,
        error_message=job.error_message if job else None,
        page_count=version.page_count,
    )


async def list_blocks(
    session: AsyncSession,
    document_id: UUID,
    owner_id: str,
    limit: int,
    offset: int,
) -> tuple[list[ContentBlock], int]:
    document, version = await _get_owned_version(session, document_id, owner_id)
    _require_readable(document)
    filters = ContentBlock.document_version_id == version.id
    total = await session.scalar(select(func.count()).select_from(ContentBlock).where(filters))
    blocks = await session.scalars(
        select(ContentBlock)
        .where(filters)
        .order_by(ContentBlock.sequence_number)
        .limit(limit)
        .offset(offset)
    )
    return list(blocks), int(total or 0)


async def get_page(
    session: AsyncSession, document_id: UUID, owner_id: str, page_number: int
) -> tuple[Page, list[ContentBlock]]:
    document, version = await _get_owned_version(session, document_id, owner_id)
    _require_readable(document)
    page = await session.scalar(
        select(Page).where(Page.document_version_id == version.id, Page.page_number == page_number)
    )
    if page is None:
        raise DocumentNotFoundError("Page not found")
    blocks = await session.scalars(
        select(ContentBlock)
        .where(ContentBlock.page_id == page.id)
        .order_by(ContentBlock.sequence_number)
    )
    return page, list(blocks)


async def get_toc(
    session: AsyncSession, document_id: UUID, owner_id: str
) -> list[dict[str, object]]:
    document, version = await _get_owned_version(session, document_id, owner_id)
    _require_readable(document)
    blocks = list(
        await session.scalars(
            select(ContentBlock)
            .where(ContentBlock.document_version_id == version.id)
            .order_by(ContentBlock.sequence_number)
        )
    )
    headings = [block for block in blocks if block.block_type.startswith("HEADING_")]
    if version.pdf_outline:
        output: list[dict[str, object]] = []
        used: set[UUID] = set()
        for outline_item in version.pdf_outline:
            page_number = int(str(outline_item.get("page_number", 0)))
            title = str(outline_item.get("title", "")).strip()
            level = min(3, max(1, int(str(outline_item.get("level", 1)))))
            candidates = [block for block in blocks if block.page_number == page_number]
            match = next(
                (
                    block
                    for block in candidates
                    if block.id not in used
                    and block.block_type != "PAGE_BREAK"
                    and (
                        block.text.casefold() == title.casefold()
                        or title.casefold() in block.text.casefold()
                    )
                ),
                None,
            )
            match = match or next(
                (block for block in candidates if block.id not in used and block.text), None
            )
            if match is not None and title:
                used.add(match.id)
                output.append(
                    {
                        "block_id": match.id,
                        "title": title,
                        "level": level,
                        "page_number": page_number,
                        "sequence_number": match.sequence_number,
                    }
                )
        if output:
            return output
    return [
        {
            "block_id": block.id,
            "title": block.text,
            "level": int(block.block_type[-1]),
            "page_number": block.page_number,
            "sequence_number": block.sequence_number,
        }
        for block in headings
    ]


async def search_blocks(
    session: AsyncSession, document_id: UUID, owner_id: str, query: str, limit: int
) -> tuple[list[ContentBlock], int]:
    document, version = await _get_owned_version(session, document_id, owner_id)
    _require_readable(document)
    normalized_query = query.strip().casefold()
    filters = (
        ContentBlock.document_version_id == version.id,
        ContentBlock.block_type != "PAGE_BREAK",
        func.lower(ContentBlock.text).contains(normalized_query),
    )
    total = await session.scalar(select(func.count()).select_from(ContentBlock).where(*filters))
    blocks = await session.scalars(
        select(ContentBlock).where(*filters).order_by(ContentBlock.sequence_number).limit(limit)
    )
    return list(blocks), int(total or 0)


async def get_original_pdf(
    session: AsyncSession,
    storage: StorageService,
    document_id: UUID,
    owner_id: str,
) -> tuple[bytes, str]:
    document, version = await _get_owned_version(session, document_id, owner_id)
    return await storage.download(version.storage_key), document.original_filename


async def get_protected_block_image(
    session: AsyncSession,
    storage: StorageService,
    block_id: UUID,
    owner_id: str,
) -> tuple[bytes, str]:
    block = await session.scalar(
        select(ContentBlock)
        .join(DocumentVersion, DocumentVersion.id == ContentBlock.document_version_id)
        .join(Document, Document.id == DocumentVersion.document_id)
        .where(
            ContentBlock.id == block_id,
            ContentBlock.block_type == "IMAGE",
            Document.owner_id == owner_id,
        )
    )
    if block is None:
        raise DocumentNotFoundError("Image block not found")
    storage_key = str(block.block_metadata.get("storage_key", ""))
    expected_prefix = f"derived/{block.document_version_id}/"
    if not storage_key.startswith(expected_prefix):
        raise DocumentNotFoundError("Image artifact not found")
    media_type = str(block.block_metadata.get("media_type", "image/png"))
    if media_type not in {"image/png", "image/jpeg", "image/webp", "image/gif"}:
        media_type = "application/octet-stream"
    return await storage.download(storage_key), media_type

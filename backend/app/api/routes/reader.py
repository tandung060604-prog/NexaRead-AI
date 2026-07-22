from typing import Annotated, NoReturn
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_owner_id
from app.db.session import get_database_session
from app.schemas.reader import (
    ContentBlockListResponse,
    ContentBlockResponse,
    PageResponse,
    ProcessingStatusResponse,
    SearchResponse,
    TocItemResponse,
    TocResponse,
)
from app.services.documents import DocumentNotFoundError
from app.services.reader import (
    DocumentNotReadableError,
    get_original_pdf,
    get_page,
    get_processing_status,
    get_protected_block_image,
    get_toc,
    list_blocks,
    search_blocks,
)
from app.services.storage import StorageError, StorageService, get_storage_service

router = APIRouter(prefix="/api/documents", tags=["reader"])

SessionDependency = Annotated[AsyncSession, Depends(get_database_session)]
StorageDependency = Annotated[StorageService, Depends(get_storage_service)]
OwnerDependency = Annotated[str, Depends(get_current_owner_id)]


def _raise_reader_error(exc: Exception) -> NoReturn:
    if isinstance(exc, DocumentNotFoundError):
        raise HTTPException(status_code=404, detail="Document content not found") from exc
    if isinstance(exc, DocumentNotReadableError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Document is not readable (status: {exc.document_status})",
        ) from exc
    if isinstance(exc, StorageError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Original PDF is temporarily unavailable",
        ) from exc
    raise HTTPException(status_code=500, detail="Reader operation failed") from exc


@router.get("/{document_id}/processing-status", response_model=ProcessingStatusResponse)
async def processing_status(
    document_id: UUID, session: SessionDependency, owner_id: OwnerDependency
) -> ProcessingStatusResponse:
    try:
        result = await get_processing_status(session, document_id, owner_id)
    except DocumentNotFoundError as exc:
        _raise_reader_error(exc)
    return ProcessingStatusResponse(**result.__dict__)


@router.get("/{document_id}/toc", response_model=TocResponse)
async def document_toc(
    document_id: UUID, session: SessionDependency, owner_id: OwnerDependency
) -> TocResponse:
    try:
        items = await get_toc(session, document_id, owner_id)
    except (DocumentNotFoundError, DocumentNotReadableError) as exc:
        _raise_reader_error(exc)
    return TocResponse(items=[TocItemResponse.model_validate(item) for item in items])


@router.get("/{document_id}/blocks", response_model=ContentBlockListResponse)
async def document_blocks(
    document_id: UUID,
    session: SessionDependency,
    owner_id: OwnerDependency,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ContentBlockListResponse:
    try:
        blocks, total = await list_blocks(session, document_id, owner_id, limit, offset)
    except (DocumentNotFoundError, DocumentNotReadableError) as exc:
        _raise_reader_error(exc)
    return ContentBlockListResponse(
        items=[ContentBlockResponse.model_validate(block) for block in blocks],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{document_id}/pages/{page_number}", response_model=PageResponse)
async def document_page(
    document_id: UUID,
    page_number: int,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> PageResponse:
    try:
        page, blocks = await get_page(session, document_id, owner_id, page_number)
    except (DocumentNotFoundError, DocumentNotReadableError) as exc:
        _raise_reader_error(exc)
    return PageResponse(
        id=page.id,
        page_number=page.page_number,
        width=page.width,
        height=page.height,
        text=page.text,
        word_count=page.word_count,
        blocks=[ContentBlockResponse.model_validate(block) for block in blocks],
    )


@router.get("/{document_id}/search", response_model=SearchResponse)
async def document_search(
    document_id: UUID,
    session: SessionDependency,
    owner_id: OwnerDependency,
    q: Annotated[str, Query(min_length=2, max_length=100)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> SearchResponse:
    try:
        blocks, total = await search_blocks(session, document_id, owner_id, q, limit)
    except (DocumentNotFoundError, DocumentNotReadableError) as exc:
        _raise_reader_error(exc)
    return SearchResponse(
        query=q,
        items=[ContentBlockResponse.model_validate(block) for block in blocks],
        total=total,
    )


@router.get("/{document_id}/original")
async def original_pdf(
    document_id: UUID,
    session: SessionDependency,
    storage: StorageDependency,
    owner_id: OwnerDependency,
) -> Response:
    try:
        data, filename, mime_type = await get_original_pdf(session, storage, document_id, owner_id)
    except (DocumentNotFoundError, StorageError) as exc:
        _raise_reader_error(exc)
    encoded_filename = quote(filename)
    return Response(
        content=data,
        media_type=mime_type,
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}"},
    )


@router.get("/content-blocks/{block_id}/image")
async def protected_block_image(
    block_id: UUID,
    session: SessionDependency,
    storage: StorageDependency,
    owner_id: OwnerDependency,
) -> Response:
    try:
        data, media_type = await get_protected_block_image(session, storage, block_id, owner_id)
    except (DocumentNotFoundError, StorageError) as exc:
        _raise_reader_error(exc)
    return Response(content=data, media_type=media_type)

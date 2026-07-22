from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_owner_id
from app.core.config import Settings, get_settings
from app.db.session import get_database_session
from app.schemas.document import (
    DocumentDetailResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentUpdate,
    UrlImportRequest,
)
from app.services.documents import (
    DocumentNotFoundError,
    DocumentPersistenceError,
    DocumentQueueError,
    DocumentStorageError,
    DocumentValidationError,
    create_document,
    delete_document,
    get_document,
    list_documents,
    rename_document,
)
from app.services.queue import DocumentQueue, get_document_queue
from app.services.storage import StorageService, get_storage_service
from app.services.url_documents import create_url_document

router = APIRouter(prefix="/api/documents", tags=["documents"])

SessionDependency = Annotated[AsyncSession, Depends(get_database_session)]
StorageDependency = Annotated[StorageService, Depends(get_storage_service)]
QueueDependency = Annotated[DocumentQueue, Depends(get_document_queue)]
OwnerDependency = Annotated[str, Depends(get_current_owner_id)]
SettingsDependency = Annotated[Settings, Depends(get_settings)]


def raise_api_error(exc: Exception) -> NoReturn:
    if isinstance(exc, DocumentValidationError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if isinstance(exc, DocumentNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        ) from exc
    if isinstance(exc, DocumentStorageError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document storage operation failed",
        ) from exc
    if isinstance(exc, DocumentQueueError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document processing could not be queued",
        ) from exc
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Document operation failed",
    ) from exc


@router.post("/upload", response_model=DocumentDetailResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: Annotated[UploadFile, File(...)],
    session: SessionDependency,
    storage: StorageDependency,
    queue: QueueDependency,
    owner_id: OwnerDependency,
    settings: SettingsDependency,
) -> DocumentDetailResponse:
    try:
        document = await create_document(
            session, storage, queue, file, owner_id, settings.max_upload_size_bytes
        )
    except (
        DocumentValidationError,
        DocumentStorageError,
        DocumentPersistenceError,
        DocumentQueueError,
    ) as exc:
        raise_api_error(exc)
    return DocumentDetailResponse.model_validate(document)


@router.post(
    "/import-url", response_model=DocumentDetailResponse, status_code=status.HTTP_201_CREATED
)
async def import_document_url(
    request: UrlImportRequest,
    session: SessionDependency,
    storage: StorageDependency,
    queue: QueueDependency,
    owner_id: OwnerDependency,
    settings: SettingsDependency,
) -> DocumentDetailResponse:
    try:
        document = await create_url_document(
            session, storage, queue, request.url, owner_id, settings
        )
    except (
        DocumentValidationError,
        DocumentStorageError,
        DocumentPersistenceError,
        DocumentQueueError,
    ) as exc:
        raise_api_error(exc)
    return DocumentDetailResponse.model_validate(document)


@router.get("", response_model=DocumentListResponse)
async def get_documents(
    session: SessionDependency,
    owner_id: OwnerDependency,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> DocumentListResponse:
    documents, total = await list_documents(session, owner_id, limit, offset)
    return DocumentListResponse(
        items=[DocumentResponse.model_validate(document) for document in documents],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document_detail(
    document_id: UUID,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> DocumentDetailResponse:
    try:
        document = await get_document(session, document_id, owner_id)
    except DocumentNotFoundError as exc:
        raise_api_error(exc)
    return DocumentDetailResponse.model_validate(document)


@router.patch("/{document_id}", response_model=DocumentDetailResponse)
async def update_document(
    document_id: UUID,
    update: DocumentUpdate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> DocumentDetailResponse:
    try:
        document = await rename_document(
            session, document_id, owner_id, update.title, update.layout_override
        )
    except (DocumentNotFoundError, DocumentPersistenceError) as exc:
        raise_api_error(exc)
    return DocumentDetailResponse.model_validate(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_document(
    document_id: UUID,
    session: SessionDependency,
    storage: StorageDependency,
    owner_id: OwnerDependency,
) -> Response:
    try:
        await delete_document(session, storage, document_id, owner_id)
    except (DocumentNotFoundError, DocumentStorageError, DocumentPersistenceError) as exc:
        raise_api_error(exc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

from typing import Annotated, Literal, NoReturn
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_owner_id
from app.core.config import Settings, get_settings
from app.db.session import get_database_session
from app.schemas.document import (
    DocumentDetailResponse,
    DocumentTypeOverrideRequest,
    DocumentUpdate,
    UrlImportRequest,
)
from app.schemas.library import DocumentListResponse
from app.services.document_cover import CoverArtifact, generated_cover
from app.services.documents import (
    DocumentAlreadyProcessingError,
    DocumentNotFoundError,
    DocumentPersistenceError,
    DocumentQueueError,
    DocumentStorageError,
    DocumentValidationError,
    create_document,
    delete_document,
    get_document,
    rename_document,
    reprocess_document,
    set_document_type_override,
)
from app.services.library import list_library_documents
from app.services.queue import DocumentQueue, get_document_queue
from app.services.storage import StorageError, StorageService, get_storage_service
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
    if isinstance(exc, DocumentAlreadyProcessingError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document is already being processed",
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
    document_type_override: Annotated[str | None, Form()] = None,
    collection_id: Annotated[UUID | None, Form()] = None,
) -> DocumentDetailResponse:
    try:
        document = await create_document(
            session,
            storage,
            queue,
            file,
            owner_id,
            settings.max_upload_size_bytes,
            document_type_override=document_type_override,
            collection_id=collection_id,
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
            session,
            storage,
            queue,
            request.url,
            owner_id,
            settings,
            document_type_override=request.document_type_override,
            collection_id=request.collection_id,
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
    search: Annotated[str | None, Query(max_length=200)] = None,
    sort: Annotated[
        Literal["newest", "recent", "title", "progress"],
        Query(),
    ] = "newest",
    source_type: Annotated[str | None, Query(max_length=32)] = None,
    document_status: Annotated[
        str | None,
        Query(alias="status", max_length=32),
    ] = None,
    collection_id: Annotated[UUID | None, Query()] = None,
    tag_id: Annotated[UUID | None, Query()] = None,
    language: Annotated[str | None, Query(max_length=8)] = None,
    completion: Annotated[
        Literal["completed", "in_progress", "unread"] | None,
        Query(),
    ] = None,
    archived: Annotated[bool, Query()] = False,
) -> DocumentListResponse:
    documents, total = await list_library_documents(
        session,
        owner_id,
        limit=limit,
        offset=offset,
        search=search,
        sort=sort,
        source_type=source_type,
        status=document_status,
        collection_id=collection_id,
        tag_id=tag_id,
        language=language,
        completion=completion,
        archived=archived,
    )
    return DocumentListResponse(
        items=documents,
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


@router.get("/{document_id}/cover")
async def get_document_cover(
    document_id: UUID,
    session: SessionDependency,
    storage: StorageDependency,
    owner_id: OwnerDependency,
) -> Response:
    try:
        document = await get_document(session, document_id, owner_id)
    except DocumentNotFoundError as exc:
        raise_api_error(exc)
    latest_version = (
        max(document.versions, key=lambda version: version.version_number)
        if document.versions
        else None
    )
    artifact: CoverArtifact | None = None
    if (
        latest_version
        and latest_version.cover_storage_key
        and latest_version.cover_media_type
    ):
        try:
            cover_data = await storage.download(latest_version.cover_storage_key)
            artifact = CoverArtifact(
                data=cover_data,
                media_type=latest_version.cover_media_type,
                source=latest_version.cover_source or "cached",
                extension=(
                    latest_version.cover_storage_key.rsplit(".", 1)[-1]
                    if "." in latest_version.cover_storage_key
                    else "bin"
                ),
                content_hash=latest_version.cover_content_hash or "",
            )
        except StorageError:
            artifact = None
    if artifact is None:
        artifact = generated_cover(
            title=document.title,
            author=None,
            document_type=(
                document.document_type_override
                or document.layout_override
                or document.layout_type
                or document.source_type
            ),
        )
    return Response(
        content=artifact.data,
        media_type=artifact.media_type,
        headers={
            "Cache-Control": "private, max-age=3600",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
            "ETag": f'"{artifact.content_hash}"',
            "X-Content-Type-Options": "nosniff",
            "X-NexaRead-Cover-Source": artifact.source,
        },
    )


@router.put("/{document_id}/document-type", response_model=DocumentDetailResponse)
async def override_document_type(
    document_id: UUID,
    request: DocumentTypeOverrideRequest,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> DocumentDetailResponse:
    try:
        document = await set_document_type_override(
            session,
            document_id,
            owner_id,
            request.document_type_override,
        )
    except (DocumentNotFoundError, DocumentPersistenceError) as exc:
        raise_api_error(exc)
    return DocumentDetailResponse.model_validate(document)


@router.post(
    "/{document_id}/reprocess",
    response_model=DocumentDetailResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def reprocess_existing_document(
    document_id: UUID,
    session: SessionDependency,
    storage: StorageDependency,
    queue: QueueDependency,
    owner_id: OwnerDependency,
) -> DocumentDetailResponse:
    try:
        document = await reprocess_document(
            session,
            storage,
            queue,
            document_id,
            owner_id,
        )
    except (
        DocumentAlreadyProcessingError,
        DocumentNotFoundError,
        DocumentValidationError,
        DocumentStorageError,
        DocumentPersistenceError,
        DocumentQueueError,
    ) as exc:
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

from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_owner_id
from app.db.session import get_database_session
from app.schemas.library import (
    CollectionCreate,
    CollectionResponse,
    CollectionUpdate,
    DocumentOrganizationUpdate,
    LibraryDocumentResponse,
    TagCreate,
    TagResponse,
)
from app.services.documents import DocumentNotFoundError
from app.services.library import (
    LibraryConflictError,
    LibraryPersistenceError,
    LibraryResourceNotFoundError,
    create_collection,
    create_tag,
    delete_collection,
    delete_tag,
    list_collections,
    list_tags,
    rename_collection,
    update_document_organization,
)

router = APIRouter(prefix="/api", tags=["library"])
SessionDependency = Annotated[AsyncSession, Depends(get_database_session)]
OwnerDependency = Annotated[str, Depends(get_current_owner_id)]


def raise_library_error(exc: Exception) -> NoReturn:
    if isinstance(exc, (LibraryResourceNotFoundError, DocumentNotFoundError)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LIBRARY_RESOURCE_NOT_FOUND"},
        ) from exc
    if isinstance(exc, LibraryConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "LIBRARY_NAME_ALREADY_EXISTS"},
        ) from exc
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={"code": "LIBRARY_OPERATION_FAILED"},
    ) from exc


@router.get("/collections", response_model=list[CollectionResponse])
async def get_collections(
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> list[CollectionResponse]:
    return await list_collections(session, owner_id)


@router.post(
    "/collections",
    response_model=CollectionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_collection(
    request: CollectionCreate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> CollectionResponse:
    try:
        return await create_collection(session, owner_id, request.name)
    except (LibraryConflictError, LibraryPersistenceError) as exc:
        raise_library_error(exc)


@router.patch("/collections/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: UUID,
    request: CollectionUpdate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> CollectionResponse:
    try:
        return await rename_collection(
            session,
            owner_id,
            collection_id,
            request.name,
        )
    except (
        LibraryConflictError,
        LibraryPersistenceError,
        LibraryResourceNotFoundError,
    ) as exc:
        raise_library_error(exc)


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_collection(
    collection_id: UUID,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> Response:
    try:
        await delete_collection(session, owner_id, collection_id)
    except (LibraryPersistenceError, LibraryResourceNotFoundError) as exc:
        raise_library_error(exc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tags", response_model=list[TagResponse])
async def get_tags(
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> list[TagResponse]:
    return await list_tags(session, owner_id)


@router.post("/tags", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def add_tag(
    request: TagCreate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> TagResponse:
    try:
        return await create_tag(session, owner_id, request.name)
    except (LibraryConflictError, LibraryPersistenceError) as exc:
        raise_library_error(exc)


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_tag(
    tag_id: UUID,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> Response:
    try:
        await delete_tag(session, owner_id, tag_id)
    except (LibraryPersistenceError, LibraryResourceNotFoundError) as exc:
        raise_library_error(exc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch(
    "/documents/{document_id}/organization",
    response_model=LibraryDocumentResponse,
)
async def organize_document(
    document_id: UUID,
    request: DocumentOrganizationUpdate,
    session: SessionDependency,
    owner_id: OwnerDependency,
) -> LibraryDocumentResponse:
    try:
        return await update_document_organization(
            session,
            owner_id,
            document_id,
            request,
        )
    except (
        DocumentNotFoundError,
        LibraryPersistenceError,
        LibraryResourceNotFoundError,
    ) as exc:
        raise_library_error(exc)

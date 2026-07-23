from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.annotation import ReadingProgress
from app.models.document import Collection, Document, Tag, utc_now
from app.schemas.document import DocumentResponse
from app.schemas.library import (
    CollectionResponse,
    CollectionSummary,
    DocumentOrganizationUpdate,
    LibraryDocumentResponse,
    TagResponse,
)
from app.services.documents import DocumentNotFoundError


class LibraryResourceNotFoundError(LookupError):
    pass


class LibraryConflictError(RuntimeError):
    pass


class LibraryPersistenceError(RuntimeError):
    pass


def _normalized_name(name: str, max_length: int) -> str:
    return name.casefold()[:max_length]


def _document_language(document: Document) -> str:
    if not document.versions:
        return "und"
    metadata = max(
        document.versions,
        key=lambda version: version.version_number,
    ).pdf_metadata
    language = metadata.get("language")
    return language if isinstance(language, str) else "und"


def _library_document(
    document: Document,
    progress: ReadingProgress | None,
) -> LibraryDocumentResponse:
    progress_percent = progress.progress_percent if progress else 0.0
    base = DocumentResponse.model_validate(document).model_dump()
    return LibraryDocumentResponse(
        **base,
        collection=(
            CollectionSummary.model_validate(document.collection)
            if document.collection
            else None
        ),
        tags=[
            TagResponse.model_validate(tag)
            for tag in sorted(document.tags, key=lambda item: item.name.casefold())
        ],
        progress_percent=progress_percent,
        language=_document_language(document),
        completed=progress_percent >= 100,
    )


def _recent_timestamp(
    document: Document,
    progress: ReadingProgress | None,
) -> float:
    candidate = progress.updated_at if progress else document.last_read_at
    return candidate.timestamp() if candidate else 0.0


def _progress_percent(progress: ReadingProgress | None) -> float:
    return progress.progress_percent if progress else 0.0


async def list_library_documents(
    session: AsyncSession,
    owner_id: str,
    *,
    limit: int,
    offset: int,
    search: str | None = None,
    sort: str = "newest",
    source_type: str | None = None,
    status: str | None = None,
    collection_id: UUID | None = None,
    tag_id: UUID | None = None,
    language: str | None = None,
    completion: str | None = None,
    archived: bool = False,
) -> tuple[list[LibraryDocumentResponse], int]:
    documents = list(
        await session.scalars(
            select(Document)
            .where(Document.owner_id == owner_id)
            .options(
                selectinload(Document.versions),
                selectinload(Document.processing_jobs),
                selectinload(Document.collection),
                selectinload(Document.tags),
            )
        )
    )
    progress_items = list(
        await session.scalars(
            select(ReadingProgress).where(ReadingProgress.user_id == owner_id)
        )
    )
    progress_by_document = {item.document_id: item for item in progress_items}

    normalized_search = search.casefold().strip() if search else None
    normalized_source_type = source_type.casefold() if source_type else None
    normalized_status = status.upper() if status else None
    normalized_language = language.casefold() if language else None

    filtered: list[Document] = []
    for document in documents:
        progress = progress_by_document.get(document.id)
        progress_percent = progress.progress_percent if progress else 0.0
        if (document.archived_at is not None) != archived:
            continue
        if normalized_search and normalized_search not in (
            f"{document.title} {document.original_filename}".casefold()
        ):
            continue
        if normalized_source_type and document.source_type.casefold() != normalized_source_type:
            continue
        if normalized_status and document.status.upper() != normalized_status:
            continue
        if collection_id and document.collection_id != collection_id:
            continue
        if tag_id and all(tag.id != tag_id for tag in document.tags):
            continue
        if (
            normalized_language
            and _document_language(document).casefold() != normalized_language
        ):
            continue
        if completion == "completed" and progress_percent < 100:
            continue
        if completion == "in_progress" and not 0 < progress_percent < 100:
            continue
        if completion == "unread" and progress_percent > 0:
            continue
        filtered.append(document)

    if sort == "recent":
        filtered.sort(
            key=lambda item: _recent_timestamp(
                item,
                progress_by_document.get(item.id),
            ),
            reverse=True,
        )
    elif sort == "title":
        filtered.sort(key=lambda item: item.title.casefold())
    elif sort == "progress":
        filtered.sort(
            key=lambda item: _progress_percent(progress_by_document.get(item.id)),
            reverse=True,
        )
    else:
        filtered.sort(key=lambda item: item.created_at, reverse=True)

    total = len(filtered)
    page = filtered[offset : offset + limit]
    return [
        _library_document(document, progress_by_document.get(document.id))
        for document in page
    ], total


async def list_collections(
    session: AsyncSession,
    owner_id: str,
) -> list[CollectionResponse]:
    collections = list(
        await session.scalars(
            select(Collection)
            .where(Collection.owner_id == owner_id)
            .options(selectinload(Collection.documents))
            .order_by(Collection.name)
        )
    )
    return [
        CollectionResponse(
            id=collection.id,
            name=collection.name,
            document_count=sum(
                document.archived_at is None for document in collection.documents
            ),
            created_at=collection.created_at,
            updated_at=collection.updated_at,
        )
        for collection in collections
    ]


async def _get_collection(
    session: AsyncSession,
    owner_id: str,
    collection_id: UUID,
) -> Collection:
    collection = await session.scalar(
        select(Collection)
        .where(Collection.id == collection_id, Collection.owner_id == owner_id)
        .options(selectinload(Collection.documents))
    )
    if collection is None:
        raise LibraryResourceNotFoundError("Collection not found")
    return collection


async def create_collection(
    session: AsyncSession,
    owner_id: str,
    name: str,
) -> CollectionResponse:
    collection = Collection(
        owner_id=owner_id,
        name=name,
        normalized_name=_normalized_name(name, 80),
    )
    session.add(collection)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise LibraryConflictError("A collection with this name already exists") from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise LibraryPersistenceError("Could not create collection") from exc
    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        document_count=0,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


async def rename_collection(
    session: AsyncSession,
    owner_id: str,
    collection_id: UUID,
    name: str,
) -> CollectionResponse:
    collection = await _get_collection(session, owner_id, collection_id)
    collection.name = name
    collection.normalized_name = _normalized_name(name, 80)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise LibraryConflictError("A collection with this name already exists") from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise LibraryPersistenceError("Could not rename collection") from exc
    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        document_count=sum(
            document.archived_at is None for document in collection.documents
        ),
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


async def delete_collection(
    session: AsyncSession,
    owner_id: str,
    collection_id: UUID,
) -> None:
    collection = await _get_collection(session, owner_id, collection_id)
    for document in collection.documents:
        document.collection = None
    try:
        await session.delete(collection)
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise LibraryPersistenceError("Could not delete collection") from exc


async def list_tags(session: AsyncSession, owner_id: str) -> list[TagResponse]:
    tags = list(
        await session.scalars(
            select(Tag).where(Tag.owner_id == owner_id).order_by(Tag.name)
        )
    )
    return [TagResponse.model_validate(tag) for tag in tags]


async def create_tag(
    session: AsyncSession,
    owner_id: str,
    name: str,
) -> TagResponse:
    tag = Tag(
        owner_id=owner_id,
        name=name,
        normalized_name=_normalized_name(name, 48),
    )
    session.add(tag)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise LibraryConflictError("A tag with this name already exists") from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise LibraryPersistenceError("Could not create tag") from exc
    return TagResponse.model_validate(tag)


async def delete_tag(
    session: AsyncSession,
    owner_id: str,
    tag_id: UUID,
) -> None:
    tag = await session.scalar(
        select(Tag).where(Tag.id == tag_id, Tag.owner_id == owner_id)
    )
    if tag is None:
        raise LibraryResourceNotFoundError("Tag not found")
    try:
        await session.delete(tag)
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise LibraryPersistenceError("Could not delete tag") from exc


async def update_document_organization(
    session: AsyncSession,
    owner_id: str,
    document_id: UUID,
    update: DocumentOrganizationUpdate,
) -> LibraryDocumentResponse:
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

    if "collection_id" in update.model_fields_set:
        if update.collection_id is None:
            document.collection = None
        else:
            document.collection = await _get_collection(
                session,
                owner_id,
                update.collection_id,
            )

    if update.tag_ids is not None:
        tags = list(
            await session.scalars(
                select(Tag).where(
                    Tag.owner_id == owner_id,
                    Tag.id.in_(update.tag_ids),
                )
            )
        )
        if len(tags) != len(update.tag_ids):
            raise LibraryResourceNotFoundError("One or more tags were not found")
        document.tags = tags

    if update.archived is not None:
        document.archived_at = utc_now() if update.archived else None

    try:
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise LibraryPersistenceError("Could not organize document") from exc
    progress = await session.scalar(
        select(ReadingProgress).where(
            ReadingProgress.user_id == owner_id,
            ReadingProgress.document_id == document.id,
        )
    )
    return _library_document(document, progress)

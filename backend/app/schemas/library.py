from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.document import DocumentResponse


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Collection name must not be empty")
        return normalized


class CollectionUpdate(CollectionCreate):
    pass


class CollectionSummary(BaseModel):
    id: UUID
    name: str

    model_config = ConfigDict(from_attributes=True)


class CollectionResponse(CollectionSummary):
    document_count: int
    created_at: datetime
    updated_at: datetime


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=48)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Tag name must not be empty")
        return normalized


class TagResponse(BaseModel):
    id: UUID
    name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentOrganizationUpdate(BaseModel):
    collection_id: UUID | None = None
    tag_ids: list[UUID] | None = Field(default=None, max_length=20)
    archived: bool | None = None

    @field_validator("tag_ids")
    @classmethod
    def deduplicate_tags(cls, value: list[UUID] | None) -> list[UUID] | None:
        return list(dict.fromkeys(value)) if value is not None else None


class LibraryDocumentResponse(DocumentResponse):
    collection: CollectionSummary | None
    tags: list[TagResponse]
    progress_percent: float
    language: str
    completed: bool


class DocumentListResponse(BaseModel):
    items: list[LibraryDocumentResponse]
    total: int
    limit: int
    offset: int

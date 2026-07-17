from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DocumentVersionResponse(BaseModel):
    id: UUID
    version_number: int
    content_hash: str
    page_count: int | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProcessingJobResponse(BaseModel):
    id: UUID
    job_type: str
    status: str
    progress: int
    error_code: str | None
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentResponse(BaseModel):
    id: UUID
    title: str
    original_filename: str
    source_type: str
    mime_type: str
    file_size: int
    status: str
    created_at: datetime
    updated_at: datetime
    last_read_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class DocumentDetailResponse(DocumentResponse):
    versions: list[DocumentVersionResponse]
    processing_jobs: list[ProcessingJobResponse]


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int
    limit: int
    offset: int


class DocumentUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=255)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Title must not be empty")
        return normalized

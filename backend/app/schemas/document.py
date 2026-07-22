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
    source_url: str | None
    mime_type: str
    file_size: int
    layout_type: str
    layout_override: str | None
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
    title: str | None = Field(default=None, min_length=1, max_length=255)
    layout_override: str | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Title must not be empty")
        return normalized

    @field_validator("layout_override")
    @classmethod
    def validate_layout_override(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        allowed = {
            "BOOK",
            "PAPER",
            "TECHNICAL_DOCUMENTATION",
            "BLOG_ARTICLE",
            "GENERAL_DOCUMENT",
        }
        if normalized not in allowed:
            raise ValueError("Unsupported layout type")
        return normalized


class UrlImportRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)

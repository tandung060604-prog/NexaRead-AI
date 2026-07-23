from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

DOCUMENT_TYPES = {
    "BOOK",
    "TEXTBOOK",
    "LECTURE",
    "RESEARCH_PAPER",
    "THESIS",
    "TECHNICAL",
    "REPORT",
    "LEGAL",
    "WORK",
    "WEB_ARTICLE",
    "OTHER",
}


class DocumentVersionResponse(BaseModel):
    id: UUID
    version_number: int
    content_hash: str
    page_count: int | None
    cover_source: str | None
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
    collection_id: UUID | None
    layout_type: str
    layout_override: str | None
    document_type_override: str | None
    status: str
    created_at: datetime
    updated_at: datetime
    last_read_at: datetime | None
    archived_at: datetime | None
    cover_url: str

    model_config = ConfigDict(from_attributes=True)


class DocumentProcessingResult(BaseModel):
    detected_document_type: str
    effective_document_type: str
    document_type_override: str | None
    language: str
    source_page_count: int
    chapter_count: int
    layout_quality: str
    layout_quality_score: float | None
    warnings: list[str]


class DocumentDetailResponse(DocumentResponse):
    versions: list[DocumentVersionResponse]
    processing_jobs: list[ProcessingJobResponse]
    processing_result: DocumentProcessingResult | None


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


class DocumentTypeOverrideRequest(BaseModel):
    document_type_override: str | None = None

    @field_validator("document_type_override")
    @classmethod
    def validate_document_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if normalized not in DOCUMENT_TYPES:
            raise ValueError("Unsupported document type")
        return normalized


class UrlImportRequest(DocumentTypeOverrideRequest):
    url: str = Field(min_length=8, max_length=2048)
    collection_id: UUID | None = None

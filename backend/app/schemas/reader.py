from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProcessingStatusResponse(BaseModel):
    document_id: UUID
    status: str
    stage: str
    progress: int
    error_code: str | None
    error_message: str | None
    page_count: int | None


class TocItemResponse(BaseModel):
    block_id: UUID
    title: str
    level: int
    page_number: int
    sequence_number: int


class TocResponse(BaseModel):
    items: list[TocItemResponse]


class ContentBlockResponse(BaseModel):
    id: UUID
    parent_block_id: UUID | None
    sequence_number: int
    block_type: str
    text: str
    page_number: int
    chapter_index: int | None
    section_index: int | None
    paragraph_index: int | None
    start_offset: int
    end_offset: int
    bounding_box: list[float]
    font_name: str | None
    font_size: float | None
    is_bold: bool
    is_italic: bool
    confidence: float
    metadata: dict[str, object] = Field(validation_alias="block_metadata")
    content_hash: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ContentBlockListResponse(BaseModel):
    items: list[ContentBlockResponse]
    total: int
    limit: int
    offset: int


class PageResponse(BaseModel):
    id: UUID
    page_number: int
    width: float
    height: float
    text: str
    word_count: int
    blocks: list[ContentBlockResponse]


class SearchResponse(BaseModel):
    query: str
    items: list[ContentBlockResponse]
    total: int

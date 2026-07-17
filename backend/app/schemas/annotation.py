from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

HighlightColor = Literal["yellow", "green", "blue", "pink", "purple"]
HighlightStatus = Literal["ACTIVE", "NEEDS_REVIEW", "ORPHANED"]
ReaderTheme = Literal["light", "dark", "sepia"]
ReaderFontFamily = Literal["sans", "serif", "dyslexic"]


class ProgressUpdate(BaseModel):
    document_version_id: UUID
    last_block_id: UUID | None = None
    page_number: int = Field(ge=1)
    progress_percent: float = Field(ge=0, le=100)
    scroll_offset: float = Field(default=0, ge=0)
    reading_mode: str = Field(default="standard", min_length=1, max_length=32)


class ProgressResponse(ProgressUpdate):
    id: UUID
    document_id: UUID
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BookmarkCreate(BaseModel):
    document_version_id: UUID
    content_block_id: UUID
    title: str | None = Field(default=None, max_length=255)


class BookmarkResponse(BaseModel):
    id: UUID
    document_id: UUID
    document_version_id: UUID
    content_block_id: UUID
    page_number: int
    title: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BookmarkListResponse(BaseModel):
    items: list[BookmarkResponse]


class NoteCreate(BaseModel):
    content: str = Field(min_length=1, max_length=10_000)


class NoteUpdate(NoteCreate):
    pass


class NoteResponse(BaseModel):
    id: UUID
    highlight_id: UUID
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HighlightCreate(BaseModel):
    document_version_id: UUID
    content_block_id: UUID
    start_offset: int = Field(ge=0)
    end_offset: int = Field(gt=0)
    selected_text: str = Field(min_length=1)
    prefix_text: str = Field(default="", max_length=200)
    suffix_text: str = Field(default="", max_length=200)
    color: HighlightColor = "yellow"


class HighlightUpdate(BaseModel):
    color: HighlightColor | None = None
    status: HighlightStatus | None = None


class HighlightResponse(BaseModel):
    id: UUID
    document_id: UUID
    document_version_id: UUID
    content_block_id: UUID
    start_offset: int
    end_offset: int
    selected_text: str
    prefix_text: str
    suffix_text: str
    color: HighlightColor
    status: HighlightStatus
    created_at: datetime
    updated_at: datetime
    note: NoteResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class HighlightListResponse(BaseModel):
    items: list[HighlightResponse]


class ReadingPreferenceUpdate(BaseModel):
    theme: ReaderTheme = "light"
    font_size: int = Field(default=17, ge=14, le=28)
    line_height: float = Field(default=1.8, ge=1.3, le=2.2)
    reading_width: int = Field(default=720, ge=520, le=1000)
    font_family: ReaderFontFamily = "sans"
    focus_mode: bool = False


class ReadingPreferenceResponse(ReadingPreferenceUpdate):
    id: UUID | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

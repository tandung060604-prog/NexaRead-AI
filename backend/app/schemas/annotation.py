from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

HighlightColor = Literal["yellow", "green", "blue", "pink", "purple"]
HighlightStatus = Literal["ACTIVE", "NEEDS_REVIEW", "ORPHANED"]
ReaderTheme = Literal["light", "dark", "sepia"]
ReaderFontFamily = Literal["sans", "serif", "dyslexic"]
ReadingMode = Literal["original", "clean", "book", "study"]
ReaderLanguage = Literal["vi", "en"]
KeywordLevel = Literal["BEGINNER", "INTERMEDIATE", "ADVANCED"]


class ProgressUpdate(BaseModel):
    document_version_id: UUID
    last_block_id: UUID | None = None
    page_number: int = Field(ge=1)
    progress_percent: float = Field(ge=0, le=100)
    scroll_offset: float = Field(default=0, ge=0)
    reading_mode: ReadingMode = "clean"

    @field_validator("reading_mode", mode="before")
    @classmethod
    def normalize_legacy_reading_mode(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return {
            "pdf": "original",
            "scroll": "clean",
            "standard": "clean",
            "focus": "clean",
        }.get(value, value)


class ProgressResponse(ProgressUpdate):
    id: UUID
    document_id: UUID
    reading_seconds: int = 0
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
    reading_mode: ReadingMode = "clean"
    reading_room: str = Field(default="minimal-focus", min_length=1, max_length=64)
    page_turn_animation: bool = True
    page_turn_sound: bool = False
    ambient_sound: bool = False
    master_volume: float = Field(default=0.7, ge=0, le=1)
    ambient_volume: float = Field(default=0.5, ge=0, le=1)
    page_turn_volume: float = Field(default=0.6, ge=0, le=1)
    language: ReaderLanguage = "vi"
    keyword_level: KeywordLevel = "BEGINNER"
    use_document_type_defaults: bool = False
    analytics_enabled: bool = False


class ReadingPreferenceResponse(ReadingPreferenceUpdate):
    id: UUID | None = None
    use_document_type_defaults: bool = True
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.keyword import KEYWORD_CATEGORIES

KeywordLevel = Literal["BEGINNER", "INTERMEDIATE", "ADVANCED"]
FeedbackType = Literal["HELPFUL", "NOT_TECHNICAL", "WRONG_MEANING", "TOO_BASIC", "TOO_ADVANCED"]


class KeywordSummaryResponse(BaseModel):
    id: UUID
    canonical_name: str
    slug: str
    category: str
    short_definition: str
    difficulty: KeywordLevel
    taxonomy_version: str

    model_config = ConfigDict(from_attributes=True)


class KeywordOccurrenceResponse(BaseModel):
    id: UUID
    keyword: KeywordSummaryResponse
    document_id: UUID
    document_version_id: UUID
    content_block_id: UUID
    page_number: int
    sequence_number: int
    start_offset: int
    end_offset: int
    surface_text: str
    confidence: float
    detection_method: str
    is_suppressed: bool


class DocumentKeywordResponse(BaseModel):
    items: list[KeywordOccurrenceResponse]
    total: int
    categories: list[str]
    taxonomy_version: str | None


class KeywordDetailResponse(KeywordSummaryResponse):
    aliases: list[str]
    explanation: str
    beginner_explanation: str
    intermediate_explanation: str
    advanced_explanation: str
    related_keywords: list[KeywordSummaryResponse]


class KeywordFeedbackCreate(BaseModel):
    document_id: UUID
    occurrence_id: UUID
    feedback_type: FeedbackType
    comment: str | None = Field(default=None, max_length=2000)


class KeywordFeedbackResponse(BaseModel):
    id: UUID
    document_id: UUID
    occurrence_id: UUID
    feedback_type: FeedbackType
    comment: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class KeywordPreferenceUpdate(BaseModel):
    enabled: bool = True
    user_level: KeywordLevel = "BEGINNER"
    enabled_categories: list[str] = Field(default_factory=lambda: list(KEYWORD_CATEGORIES))
    min_confidence: float = Field(default=0.75, ge=0, le=1)

    @field_validator("enabled_categories")
    @classmethod
    def validate_categories(cls, value: list[str]) -> list[str]:
        invalid = set(value) - set(KEYWORD_CATEGORIES)
        if invalid:
            raise ValueError(f"Unknown keyword categories: {', '.join(sorted(invalid))}")
        return list(dict.fromkeys(value))


class KeywordPreferenceResponse(KeywordPreferenceUpdate):
    id: UUID | None = None
    available_categories: list[str] = Field(default_factory=lambda: list(KEYWORD_CATEGORIES))
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

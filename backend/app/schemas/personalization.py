from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

ReadingType = Literal["STUDY", "RESEARCH", "WORK", "BOOKS", "TECHNICAL"]
ReadingGoal = Literal["UNDERSTAND", "REMEMBER", "REFERENCE", "COMPLETE"]
DisplayPreference = Literal["AUTO", "BOOK", "CLEAN", "STUDY"]
OnboardingStatus = Literal["NOT_STARTED", "COMPLETED", "SKIPPED"]


class OnboardingUpdate(BaseModel):
    reading_types: list[ReadingType] = Field(min_length=1, max_length=5)
    reading_goal: ReadingGoal
    display_preference: DisplayPreference
    analytics_enabled: bool = False

    @field_validator("reading_types")
    @classmethod
    def unique_reading_types(cls, values: list[ReadingType]) -> list[ReadingType]:
        if len(values) != len(set(values)):
            raise ValueError("Reading types must be unique")
        return values


class OnboardingResponse(BaseModel):
    status: OnboardingStatus
    reading_types: list[ReadingType]
    reading_goal: ReadingGoal | None
    display_preference: DisplayPreference | None
    analytics_enabled: bool
    completed_at: datetime | None
    skipped_at: datetime | None


class AnalyticsPreferenceUpdate(BaseModel):
    enabled: bool


class ReadingAnalyticsResponse(BaseModel):
    enabled: bool
    total_reading_seconds: int
    reading_streak_days: int
    documents_started: int
    documents_completed: int
    source_pages_reached: int
    active_dates: list[date]

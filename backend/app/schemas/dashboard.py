from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class DashboardDocumentCard(BaseModel):
    id: UUID
    title: str
    source_type: str
    document_type: str
    created_at: datetime
    progress_percent: float
    last_chapter: str | None
    last_read_at: datetime | None
    status: str
    processing_status: str | None
    processing_progress: int
    cover_url: str


class DashboardBookmark(BaseModel):
    id: UUID
    document_id: UUID
    document_title: str
    title: str
    page_number: int
    created_at: datetime


class DashboardNote(BaseModel):
    id: UUID
    document_id: UUID
    document_title: str
    content: str
    selected_text: str
    updated_at: datetime


class DashboardStats(BaseModel):
    total_documents: int
    in_progress_documents: int
    completed_documents: int
    bookmark_count: int
    note_count: int
    analytics_enabled: bool
    reading_time_seconds: int
    reading_streak_days: int
    source_pages_reached: int


class DashboardCollection(BaseModel):
    id: UUID
    name: str
    document_count: int


class DashboardResponse(BaseModel):
    continue_reading: list[DashboardDocumentCard]
    recent_documents: list[DashboardDocumentCard]
    processing_documents: list[DashboardDocumentCard]
    completed_documents: list[DashboardDocumentCard]
    collections: list[DashboardCollection]
    recent_bookmarks: list[DashboardBookmark]
    recent_notes: list[DashboardNote]
    stats: DashboardStats

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=4000)
    session_id: UUID | None = None
    stream: bool = False


class SummarizeRequest(BaseModel):
    session_id: UUID | None = None
    stream: bool = False


class ExplainRequest(BaseModel):
    question: str = Field(
        default="Hãy giải thích đoạn này dễ hiểu hơn.", min_length=2, max_length=4000
    )
    content_block_id: UUID | None = None
    session_id: UUID | None = None
    stream: bool = False


class CitationResponse(BaseModel):
    id: UUID
    source_label: str
    chunk_id: UUID
    content_block_id: UUID
    quoted_text: str
    page_number: int
    section_title: str | None
    relevance_score: float

    model_config = ConfigDict(from_attributes=True)


class ChatMessageResponse(BaseModel):
    id: UUID
    session_id: UUID
    role: str = "assistant"
    content: str
    model: str | None
    latency_ms: int | None
    prompt_tokens: int
    completion_tokens: int
    cost_microusd: int
    status: str
    citations: list[CitationResponse]
    created_at: datetime


class ChatSessionSummaryResponse(BaseModel):
    id: UUID
    document_id: UUID
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatSessionListResponse(BaseModel):
    items: list[ChatSessionSummaryResponse]


class ChatHistoryMessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    model: str | None
    status: str
    citations: list[CitationResponse]
    created_at: datetime


class ChatSessionDetailResponse(ChatSessionSummaryResponse):
    messages: list[ChatHistoryMessageResponse]

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "NexaRead API"
    service_name: str = "nexaread-api"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    frontend_url: str = "http://localhost:3000"
    default_owner_id: str = "local-user"
    database_url: str = "postgresql+asyncpg://nexaread:nexaread-dev@localhost:5432/nexaread"
    redis_url: str = "redis://localhost:6379/0"
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "nexaread-minio"
    s3_secret_key: str = "nexaread-minio-dev"
    s3_bucket: str = "nexaread-documents"
    s3_region: str = "us-east-1"
    max_upload_size_mb: int = Field(default=50, ge=1, le=500)
    url_import_max_mb: int = Field(default=10, ge=1, le=50)
    url_import_timeout_seconds: float = Field(default=10.0, ge=1.0, le=30.0)
    url_import_max_redirects: int = Field(default=3, ge=0, le=5)
    parser_timeout_seconds: float = Field(default=60.0, ge=5.0, le=300.0)
    min_extracted_text_characters: int = Field(default=20, ge=1, le=10000)
    rag_provider: Literal["local", "openai"] = "local"
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    rag_embedding_model: str = "text-embedding-3-small"
    rag_embedding_dimensions: int = Field(default=384, ge=384, le=384)
    rag_answer_model: str = "gpt-5-mini"
    rag_top_k: int = Field(default=8, ge=1, le=50)
    rag_evidence_threshold: float = Field(default=0.08, ge=0.0, le=1.0)
    rag_provider_timeout_seconds: float = Field(default=30.0, ge=1.0, le=120.0)
    ai_rate_limit_per_minute: int = Field(default=30, ge=0, le=1000)
    rag_rerank_timeout_seconds: float = Field(default=0.25, ge=0.01, le=10.0)
    rag_input_cost_per_million: float = Field(default=0.0, ge=0.0)
    rag_output_cost_per_million: float = Field(default=0.0, ge=0.0)

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def url_import_max_bytes(self) -> int:
        return self.url_import_max_mb * 1024 * 1024

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()

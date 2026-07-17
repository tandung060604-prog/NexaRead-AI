from functools import lru_cache

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
    min_extracted_text_characters: int = Field(default=20, ge=1, le=10000)

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()

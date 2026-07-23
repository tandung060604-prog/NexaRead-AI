from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


def normalize_email(value: str) -> str:
    normalized = value.strip().casefold()
    local, separator, domain = normalized.rpartition("@")
    if (
        not separator
        or not local
        or not domain
        or "." not in domain
        or any(character.isspace() for character in normalized)
    ):
        raise ValueError("Email address is invalid")
    return normalized


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=10, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Display name must not be empty")
        return normalized


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)


class UpdateLocaleRequest(BaseModel):
    preferred_locale: Literal["vi", "en"]


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    preferred_locale: str
    email_verified_at: datetime | None
    created_at: datetime
    last_login_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    user: UserResponse


class AuthSessionResponse(BaseModel):
    id: UUID
    expires_at: datetime
    created_at: datetime
    last_used_at: datetime
    user_agent: str | None
    current: bool = False

    model_config = ConfigDict(from_attributes=True)


class AuthSessionListResponse(BaseModel):
    items: list[AuthSessionResponse]

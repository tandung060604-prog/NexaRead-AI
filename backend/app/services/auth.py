from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from argon2.low_level import Type
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import Settings
from app.models.auth import AuthSession, User
from app.schemas.auth import LoginRequest, RegisterRequest

password_hasher = PasswordHasher(type=Type.ID)
_DUMMY_PASSWORD_HASH = password_hasher.hash("nexaread-dummy-password")


class AuthError(RuntimeError):
    code = "AUTH_ERROR"


class EmailAlreadyExistsError(AuthError):
    code = "AUTH_EMAIL_ALREADY_EXISTS"


class InvalidCredentialsError(AuthError):
    code = "AUTH_INVALID_CREDENTIALS"


class SessionExpiredError(AuthError):
    code = "AUTH_SESSION_EXPIRED"


class SessionRevokedError(AuthError):
    code = "AUTH_SESSION_REVOKED"


class SessionNotFoundError(AuthError):
    code = "AUTH_SESSION_NOT_FOUND"


@dataclass(frozen=True)
class IssuedSession:
    session: AuthSession
    token: str
    csrf_token: str


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def hash_ip_address(ip_address: str | None, settings: Settings) -> str | None:
    key = settings.auth_ip_hash_key.get_secret_value()
    if not ip_address or not key:
        return None
    return hmac.new(
        key.encode("utf-8"),
        ip_address.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


async def register_user(session: AsyncSession, payload: RegisterRequest) -> User:
    existing = await session.scalar(
        select(User.id).where(User.normalized_email == payload.email)
    )
    if existing is not None:
        raise EmailAlreadyExistsError
    user = User(
        id=str(uuid4()),
        email=payload.email,
        normalized_email=payload.email,
        display_name=payload.display_name,
        password_hash=password_hasher.hash(payload.password),
        preferred_locale="vi",
    )
    session.add(user)
    await session.flush()
    return user


async def authenticate_user(session: AsyncSession, payload: LoginRequest) -> User:
    user = await session.scalar(
        select(User).where(User.normalized_email == payload.email)
    )
    candidate_hash = user.password_hash if user is not None else _DUMMY_PASSWORD_HASH
    valid: bool
    try:
        valid = bool(password_hasher.verify(candidate_hash, payload.password))
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        valid = False
    if user is None or not user.is_active or not valid:
        raise InvalidCredentialsError
    if password_hasher.check_needs_rehash(user.password_hash):
        user.password_hash = password_hasher.hash(payload.password)
    user.last_login_at = datetime.now(UTC)
    await session.flush()
    return user


def issue_session(
    user: User,
    *,
    settings: Settings,
    user_agent: str | None,
    ip_address: str | None,
) -> IssuedSession:
    token = secrets.token_urlsafe(48)
    csrf_token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    auth_session = AuthSession(
        user_id=user.id,
        token_hash=hash_token(token),
        csrf_token_hash=hash_token(csrf_token),
        expires_at=now + timedelta(hours=settings.auth_session_hours),
        created_at=now,
        last_used_at=now,
        user_agent=user_agent[:512] if user_agent else None,
        ip_hash=hash_ip_address(ip_address, settings),
    )
    return IssuedSession(auth_session, token, csrf_token)


async def resolve_session(
    session: AsyncSession,
    raw_token: str,
    *,
    touch: bool = False,
) -> tuple[AuthSession, User]:
    auth_session = await session.scalar(
        select(AuthSession)
        .options(joinedload(AuthSession.user))
        .where(AuthSession.token_hash == hash_token(raw_token))
    )
    if auth_session is None:
        raise SessionExpiredError
    if auth_session.revoked_at is not None:
        raise SessionRevokedError
    now = datetime.now(UTC)
    if _as_utc(auth_session.expires_at) <= now or not auth_session.user.is_active:
        raise SessionExpiredError
    if touch and now - _as_utc(auth_session.last_used_at) >= timedelta(minutes=1):
        auth_session.last_used_at = now
        await session.commit()
    return auth_session, auth_session.user


async def list_sessions(session: AsyncSession, user_id: str) -> list[AuthSession]:
    return list(
        (
            await session.scalars(
                select(AuthSession)
                .where(
                    AuthSession.user_id == user_id,
                    AuthSession.revoked_at.is_(None),
                    AuthSession.expires_at > datetime.now(UTC),
                )
                .order_by(AuthSession.created_at.desc())
            )
        ).all()
    )


async def revoke_session(
    session: AsyncSession,
    *,
    user_id: str,
    session_id: UUID,
) -> None:
    auth_session = await session.scalar(
        select(AuthSession).where(
            AuthSession.id == session_id,
            AuthSession.user_id == user_id,
        )
    )
    if auth_session is None:
        raise SessionNotFoundError
    auth_session.revoked_at = datetime.now(UTC)
    await session.commit()


async def revoke_all_sessions(session: AsyncSession, *, user_id: str) -> None:
    await session.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    await session.commit()

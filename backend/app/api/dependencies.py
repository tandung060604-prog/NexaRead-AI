from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_database_session
from app.models.auth import AuthSession, User
from app.services.auth import AuthError, hash_token, resolve_session

SessionDependency = Annotated[AsyncSession, Depends(get_database_session)]
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_EXEMPT_PATHS = {"/api/auth/login", "/api/auth/register"}


@dataclass(frozen=True)
class AuthContext:
    session: AuthSession
    user: User


def _auth_error(code: str, status_code: int) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code})


async def get_current_auth(
    request: Request,
    database_session: SessionDependency,
) -> AuthContext:
    settings = get_settings()
    raw_token = request.cookies.get(settings.auth_cookie_name)
    if not raw_token:
        raise _auth_error("AUTH_REQUIRED", status.HTTP_401_UNAUTHORIZED)
    try:
        auth_session, user = await resolve_session(
            database_session,
            raw_token,
            touch=True,
        )
    except AuthError as exc:
        raise _auth_error(exc.code, status.HTTP_401_UNAUTHORIZED) from exc
    return AuthContext(auth_session, user)


async def get_current_user(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
) -> User:
    return auth.user


async def get_current_owner_id(
    user: Annotated[User, Depends(get_current_user)],
) -> str:
    return user.id


async def enforce_csrf(
    request: Request,
    database_session: SessionDependency,
) -> None:
    if request.method in SAFE_METHODS or request.url.path in CSRF_EXEMPT_PATHS:
        return
    settings = get_settings()
    origin = request.headers.get("origin")
    if origin is not None and origin.rstrip("/") != settings.frontend_url.rstrip("/"):
        raise _auth_error("AUTH_CSRF_INVALID", status.HTTP_403_FORBIDDEN)

    raw_session_token = request.cookies.get(settings.auth_cookie_name)
    if raw_session_token is None:
        return
    cookie_token = request.cookies.get(settings.auth_csrf_cookie_name)
    header_token = request.headers.get("X-CSRF-Token")
    if (
        cookie_token is None
        or header_token is None
        or not secrets.compare_digest(cookie_token, header_token)
    ):
        raise _auth_error("AUTH_CSRF_INVALID", status.HTTP_403_FORBIDDEN)
    try:
        auth_session, _ = await resolve_session(database_session, raw_session_token)
    except AuthError as exc:
        raise _auth_error(exc.code, status.HTTP_401_UNAUTHORIZED) from exc
    if not secrets.compare_digest(auth_session.csrf_token_hash, hash_token(header_token)):
        raise _auth_error("AUTH_CSRF_INVALID", status.HTTP_403_FORBIDDEN)

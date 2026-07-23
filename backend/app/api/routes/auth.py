from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, get_current_auth
from app.core.config import Settings, get_settings
from app.db.session import get_database_session
from app.models.auth import User
from app.schemas.auth import (
    AuthResponse,
    AuthSessionListResponse,
    AuthSessionResponse,
    LoginRequest,
    RegisterRequest,
    UpdateLocaleRequest,
    UserResponse,
)
from app.services.auth import (
    AuthError,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    authenticate_user,
    issue_session,
    list_sessions,
    register_user,
    revoke_all_sessions,
    revoke_session,
)
from app.services.auth_rate_limit import (
    AuthRateLimitError,
    AuthRateLimitExceededError,
    AuthRateLimitUnavailableError,
    enforce_auth_rate_limit,
)

router = APIRouter(prefix="/api/auth", tags=["authentication"])
SessionDependency = Annotated[AsyncSession, Depends(get_database_session)]
SettingsDependency = Annotated[Settings, Depends(get_settings)]
AuthDependency = Annotated[AuthContext, Depends(get_current_auth)]


def _raise_auth_error(exc: Exception) -> NoReturn:
    if isinstance(exc, EmailAlreadyExistsError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": exc.code},
        ) from exc
    if isinstance(exc, InvalidCredentialsError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": exc.code},
        ) from exc
    if isinstance(exc, AuthRateLimitExceededError):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "AUTH_RATE_LIMITED"},
            headers={"Retry-After": "60"},
        ) from exc
    if isinstance(exc, AuthRateLimitUnavailableError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "AUTH_RATE_LIMIT_UNAVAILABLE"},
        ) from exc
    if isinstance(exc, AuthError):
        raise HTTPException(status_code=404, detail={"code": exc.code}) from exc
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={"code": "AUTH_OPERATION_FAILED"},
    ) from exc


def _client_key(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


def _set_auth_cookies(
    response: Response,
    *,
    session_token: str,
    csrf_token: str,
    settings: Settings,
) -> None:
    max_age = settings.auth_session_hours * 60 * 60
    response.set_cookie(
        settings.auth_cookie_name,
        session_token,
        max_age=max_age,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        settings.auth_csrf_cookie_name,
        csrf_token,
        max_age=max_age,
        httponly=False,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


def _clear_auth_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.auth_cookie_name, path="/")
    response.delete_cookie(settings.auth_csrf_cookie_name, path="/")


async def _complete_login(
    *,
    user: User,
    request: Request,
    response: Response,
    database_session: AsyncSession,
    settings: Settings,
) -> AuthResponse:
    issued = issue_session(
        user,
        settings=settings,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_key(request),
    )
    database_session.add(issued.session)
    await database_session.commit()
    await database_session.refresh(user)
    _set_auth_cookies(
        response,
        session_token=issued.token,
        csrf_token=issued.csrf_token,
        settings=settings,
    )
    return AuthResponse(user=UserResponse.model_validate(user))


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    database_session: SessionDependency,
    settings: SettingsDependency,
) -> AuthResponse:
    try:
        await enforce_auth_rate_limit("register", _client_key(request))
        user = await register_user(database_session, payload)
        return await _complete_login(
            user=user,
            request=request,
            response=response,
            database_session=database_session,
            settings=settings,
        )
    except IntegrityError:
        await database_session.rollback()
        _raise_auth_error(EmailAlreadyExistsError())
    except (AuthError, AuthRateLimitError) as exc:
        await database_session.rollback()
        _raise_auth_error(exc)


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    database_session: SessionDependency,
    settings: SettingsDependency,
) -> AuthResponse:
    try:
        await enforce_auth_rate_limit("login", _client_key(request))
        user = await authenticate_user(database_session, payload)
        return await _complete_login(
            user=user,
            request=request,
            response=response,
            database_session=database_session,
            settings=settings,
        )
    except (AuthError, AuthRateLimitError) as exc:
        await database_session.rollback()
        _raise_auth_error(exc)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    auth: AuthDependency,
    database_session: SessionDependency,
    settings: SettingsDependency,
) -> Response:
    auth.session.revoked_at = datetime.now(UTC)
    await database_session.commit()
    _clear_auth_cookies(response, settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserResponse)
async def me(auth: AuthDependency) -> UserResponse:
    return UserResponse.model_validate(auth.user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: UpdateLocaleRequest,
    auth: AuthDependency,
    database_session: SessionDependency,
) -> UserResponse:
    auth.user.preferred_locale = payload.preferred_locale
    await database_session.commit()
    return UserResponse.model_validate(auth.user)


@router.get("/sessions", response_model=AuthSessionListResponse)
async def sessions(
    auth: AuthDependency,
    database_session: SessionDependency,
) -> AuthSessionListResponse:
    items = await list_sessions(database_session, auth.user.id)
    return AuthSessionListResponse(
        items=[
            AuthSessionResponse(
                id=item.id,
                expires_at=item.expires_at,
                created_at=item.created_at,
                last_used_at=item.last_used_at,
                user_agent=item.user_agent,
                current=item.id == auth.session.id,
            )
            for item in items
        ]
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID,
    response: Response,
    auth: AuthDependency,
    database_session: SessionDependency,
    settings: SettingsDependency,
) -> Response:
    try:
        await revoke_session(
            database_session,
            user_id=auth.user.id,
            session_id=session_id,
        )
    except AuthError as exc:
        _raise_auth_error(exc)
    if session_id == auth.session.id:
        _clear_auth_cookies(response, settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.delete("/sessions", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sessions(
    response: Response,
    auth: AuthDependency,
    database_session: SessionDependency,
    settings: SettingsDependency,
) -> Response:
    await revoke_all_sessions(database_session, user_id=auth.user.id)
    _clear_auth_cookies(response, settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response

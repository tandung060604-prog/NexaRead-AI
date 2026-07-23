from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select

from app.api.dependencies import get_current_owner_id
from app.main import app
from app.models.auth import AuthSession, User
from app.services.auth import hash_token
from tests.conftest import ApiTestContext


def csrf_headers(api_context: ApiTestContext) -> dict[str, str]:
    token = api_context.client.cookies.get("nexaread_csrf")
    assert token is not None
    return {"X-CSRF-Token": token}


async def register(
    api_context: ApiTestContext,
    *,
    email: str = "reader@example.com",
    display_name: str = "Nguyễn An",
    password: str = "correct horse battery staple",
) -> httpx.Response:
    return await api_context.client.post(
        "/api/auth/register",
        json={
            "email": email,
            "display_name": display_name,
            "password": password,
        },
    )


@pytest.mark.anyio
async def test_register_hashes_password_and_session_tokens(
    api_context: ApiTestContext,
) -> None:
    app.dependency_overrides.pop(get_current_owner_id, None)

    response = await register(api_context, email="  Reader@Example.COM ")

    assert response.status_code == 201
    assert response.json()["user"]["email"] == "reader@example.com"
    session_token = api_context.client.cookies.get("nexaread_session")
    csrf_token = api_context.client.cookies.get("nexaread_csrf")
    assert session_token and csrf_token
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    assert api_context.session_factory is not None
    async with api_context.session_factory() as session:
        user = await session.scalar(
            select(User).where(User.normalized_email == "reader@example.com")
        )
        auth_session = await session.scalar(select(AuthSession))
        assert user is not None and user.password_hash.startswith("$argon2id$")
        assert "correct horse" not in user.password_hash
        assert auth_session is not None
        assert auth_session.token_hash == hash_token(session_token)
        assert auth_session.token_hash != session_token
        assert auth_session.csrf_token_hash == hash_token(csrf_token)


@pytest.mark.anyio
async def test_register_rejects_duplicate_normalized_email(
    api_context: ApiTestContext,
) -> None:
    app.dependency_overrides.pop(get_current_owner_id, None)
    first = await register(api_context, email="reader@example.com")
    api_context.client.cookies.clear()
    duplicate = await register(api_context, email="READER@example.com")

    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "AUTH_EMAIL_ALREADY_EXISTS"


@pytest.mark.anyio
async def test_login_me_logout_and_csrf_protection(api_context: ApiTestContext) -> None:
    app.dependency_overrides.pop(get_current_owner_id, None)
    await register(api_context)
    csrf = csrf_headers(api_context)
    logged_out = await api_context.client.post("/api/auth/logout", headers=csrf)
    assert logged_out.status_code == 204

    invalid = await api_context.client.post(
        "/api/auth/login",
        json={"email": "reader@example.com", "password": "wrong password"},
    )
    login = await api_context.client.post(
        "/api/auth/login",
        json={
            "email": "reader@example.com",
            "password": "correct horse battery staple",
        },
    )
    me = await api_context.client.get("/api/auth/me")
    missing_csrf = await api_context.client.post("/api/auth/logout")
    logout = await api_context.client.post(
        "/api/auth/logout",
        headers=csrf_headers(api_context),
    )
    after_logout = await api_context.client.get("/api/auth/me")

    assert invalid.status_code == 401
    assert invalid.json()["detail"]["code"] == "AUTH_INVALID_CREDENTIALS"
    assert login.status_code == 200
    assert me.status_code == 200
    assert me.json()["display_name"] == "Nguyễn An"
    assert missing_csrf.status_code == 403
    assert missing_csrf.json()["detail"]["code"] == "AUTH_CSRF_INVALID"
    assert logout.status_code == 204
    assert after_logout.status_code == 401
    assert after_logout.json()["detail"]["code"] == "AUTH_REQUIRED"


@pytest.mark.anyio
async def test_updates_and_persists_preferred_locale(
    api_context: ApiTestContext,
) -> None:
    app.dependency_overrides.pop(get_current_owner_id, None)
    await register(api_context)

    missing_csrf = await api_context.client.patch(
        "/api/auth/me",
        json={"preferred_locale": "en"},
    )
    updated = await api_context.client.patch(
        "/api/auth/me",
        json={"preferred_locale": "en"},
        headers=csrf_headers(api_context),
    )
    restored = await api_context.client.get("/api/auth/me")
    unsupported = await api_context.client.patch(
        "/api/auth/me",
        json={"preferred_locale": "fr"},
        headers=csrf_headers(api_context),
    )

    assert missing_csrf.status_code == 403
    assert updated.status_code == 200
    assert updated.json()["preferred_locale"] == "en"
    assert restored.json()["preferred_locale"] == "en"
    assert unsupported.status_code == 422


@pytest.mark.anyio
async def test_expired_and_revoked_sessions_are_rejected(
    api_context: ApiTestContext,
) -> None:
    app.dependency_overrides.pop(get_current_owner_id, None)
    await register(api_context)
    session_token = api_context.client.cookies.get("nexaread_session")
    assert session_token is not None and api_context.session_factory is not None
    async with api_context.session_factory() as session:
        auth_session = await session.scalar(
            select(AuthSession).where(AuthSession.token_hash == hash_token(session_token))
        )
        assert auth_session is not None
        auth_session.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        await session.commit()

    expired = await api_context.client.get("/api/auth/me")
    assert expired.status_code == 401
    assert expired.json()["detail"]["code"] == "AUTH_SESSION_EXPIRED"

    api_context.client.cookies.clear()
    login = await api_context.client.post(
        "/api/auth/login",
        json={
            "email": "reader@example.com",
            "password": "correct horse battery staple",
        },
    )
    assert login.status_code == 200
    current_token = api_context.client.cookies.get("nexaread_session")
    assert current_token is not None
    async with api_context.session_factory() as session:
        auth_session = await session.scalar(
            select(AuthSession).where(AuthSession.token_hash == hash_token(current_token))
        )
        assert auth_session is not None
        auth_session.revoked_at = datetime.now(UTC)
        await session.commit()

    revoked = await api_context.client.get("/api/auth/me")
    assert revoked.status_code == 401
    assert revoked.json()["detail"]["code"] == "AUTH_SESSION_REVOKED"


@pytest.mark.anyio
async def test_lists_and_revokes_sessions(api_context: ApiTestContext) -> None:
    app.dependency_overrides.pop(get_current_owner_id, None)
    await register(api_context)
    second_login = await api_context.client.post(
        "/api/auth/login",
        json={
            "email": "reader@example.com",
            "password": "correct horse battery staple",
        },
    )
    assert second_login.status_code == 200
    listed = await api_context.client.get("/api/auth/sessions")
    items = listed.json()["items"]
    current = next(item for item in items if item["current"])
    other = next(item for item in items if not item["current"])

    deleted = await api_context.client.delete(
        f"/api/auth/sessions/{other['id']}",
        headers=csrf_headers(api_context),
    )
    remaining = await api_context.client.get("/api/auth/sessions")
    delete_all = await api_context.client.delete(
        "/api/auth/sessions",
        headers=csrf_headers(api_context),
    )

    assert listed.status_code == 200
    assert len(items) == 2
    assert current["id"] != other["id"]
    assert deleted.status_code == 204
    assert len(remaining.json()["items"]) == 1
    assert delete_all.status_code == 204
    assert (await api_context.client.get("/api/auth/me")).status_code == 401

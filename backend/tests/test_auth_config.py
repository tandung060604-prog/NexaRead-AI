import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_production_requires_auth_rate_limiting() -> None:
    with pytest.raises(
        ValidationError,
        match="AUTH_RATE_LIMIT_PER_MINUTE must be enabled in production",
    ):
        Settings(
            _env_file=None,
            app_env="production",
            frontend_url="https://nexaread.example",
            auth_ip_hash_key="a" * 32,
            auth_rate_limit_per_minute=0,
        )


def test_production_auth_cookie_is_secure() -> None:
    settings = Settings(
        _env_file=None,
        app_env="production",
        frontend_url="https://nexaread.example",
        auth_ip_hash_key="a" * 32,
        auth_rate_limit_per_minute=10,
    )

    assert settings.auth_cookie_secure is True

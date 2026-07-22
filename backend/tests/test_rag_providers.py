import pytest

from app.core.config import Settings
from app.services.rag_providers import OpenAIRagProvider


def test_openai_provider_uses_official_base_url_when_environment_value_is_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENAI_BASE_URL", "")
    settings = Settings(_env_file=None, openai_api_key="test-key")

    provider = OpenAIRagProvider(settings)

    assert str(provider.client.base_url) == "https://api.openai.com/v1/"


def test_openai_provider_preserves_custom_base_url() -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key="test-key",
        openai_base_url="http://localhost:1234/v1",
    )

    provider = OpenAIRagProvider(settings)

    assert str(provider.client.base_url) == "http://localhost:1234/v1/"

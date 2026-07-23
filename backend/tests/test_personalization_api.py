from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.api.dependencies import get_current_owner_id
from app.main import app
from app.models.annotation import (
    ReadingDailySummary,
    ReadingProgress,
    UserReadingPreference,
)
from app.models.auth import User, UserPersonalization
from tests.conftest import ApiTestContext
from tests.test_annotations_api import readable_document, version_id


@pytest.mark.anyio
async def test_onboarding_is_optional_and_persists_explicit_choices(
    api_context: ApiTestContext,
) -> None:
    initial = await api_context.client.get("/api/users/me/onboarding")
    dashboard_before_onboarding = await api_context.client.get("/api/dashboard")
    completed = await api_context.client.put(
        "/api/users/me/onboarding",
        json={
            "reading_types": ["RESEARCH", "TECHNICAL"],
            "reading_goal": "UNDERSTAND",
            "display_preference": "BOOK",
            "analytics_enabled": True,
        },
    )

    assert initial.status_code == 200
    assert initial.json()["status"] == "NOT_STARTED"
    assert dashboard_before_onboarding.status_code == 200
    assert completed.status_code == 200
    assert completed.json()["status"] == "COMPLETED"
    assert completed.json()["reading_types"] == ["RESEARCH", "TECHNICAL"]
    assert completed.json()["analytics_enabled"] is True

    assert api_context.session_factory is not None
    async with api_context.session_factory() as session:
        profile = await session.scalar(select(UserPersonalization))
        preferences = await session.scalar(select(UserReadingPreference))
        assert profile is not None
        assert profile.reading_goal == "UNDERSTAND"
        assert preferences is not None
        assert preferences.theme == "sepia"
        assert preferences.font_family == "serif"
        assert preferences.reading_mode == "book"
        assert preferences.use_document_type_defaults is False


@pytest.mark.anyio
async def test_onboarding_can_be_skipped_and_is_owner_scoped(
    api_context: ApiTestContext,
) -> None:
    await api_context.client.put(
        "/api/users/me/onboarding",
        json={
            "reading_types": ["BOOKS"],
            "reading_goal": "REMEMBER",
            "display_preference": "AUTO",
            "analytics_enabled": False,
        },
    )
    assert api_context.session_factory is not None
    async with api_context.session_factory() as session:
        session.add(
            User(
                id="another-personalization-owner",
                email="another-personalization@example.com",
                normalized_email="another-personalization@example.com",
                display_name="Another reader",
                password_hash="!disabled!",
            )
        )
        await session.commit()

    def another_owner() -> str:
        return "another-personalization-owner"

    app.dependency_overrides[get_current_owner_id] = another_owner
    foreign_view = await api_context.client.get("/api/users/me/onboarding")
    skipped = await api_context.client.post("/api/users/me/onboarding/skip")

    assert foreign_view.status_code == 200
    assert foreign_view.json()["status"] == "NOT_STARTED"
    assert skipped.status_code == 200
    assert skipped.json()["status"] == "SKIPPED"
    assert skipped.json()["reading_types"] == []


@pytest.mark.anyio
async def test_analytics_is_opt_in_aggregated_and_deleted_when_disabled(
    api_context: ApiTestContext,
) -> None:
    document, block = await readable_document(api_context)
    document_id = str(document["id"])
    payload = {
        "document_version_id": version_id(document),
        "last_block_id": block["id"],
        "page_number": block["page_number"],
        "progress_percent": 40,
        "reading_mode": "clean",
    }
    first_save = await api_context.client.put(
        f"/api/documents/{document_id}/progress",
        json=payload,
    )
    disabled_summary = await api_context.client.get("/api/users/me/reading-analytics")
    enabled = await api_context.client.put(
        "/api/users/me/reading-analytics/preference",
        json={"enabled": True},
    )

    assert first_save.status_code == 200
    assert disabled_summary.json()["enabled"] is False
    assert disabled_summary.json()["total_reading_seconds"] == 0
    assert enabled.json()["enabled"] is True

    assert api_context.session_factory is not None
    async with api_context.session_factory() as session:
        progress = await session.scalar(select(ReadingProgress))
        assert progress is not None
        progress.updated_at = datetime.now(UTC) - timedelta(seconds=120)
        await session.commit()

    second_save = await api_context.client.put(
        f"/api/documents/{document_id}/progress",
        json={**payload, "progress_percent": 100},
    )
    summary = await api_context.client.get("/api/users/me/reading-analytics")

    assert second_save.status_code == 200
    assert second_save.json()["reading_seconds"] >= 119
    assert summary.json()["enabled"] is True
    assert summary.json()["total_reading_seconds"] >= 119
    assert summary.json()["reading_streak_days"] == 1
    assert summary.json()["documents_completed"] == 1
    assert summary.json()["source_pages_reached"] == block["page_number"]
    assert len(summary.json()["active_dates"]) == 1

    disabled = await api_context.client.put(
        "/api/users/me/reading-analytics/preference",
        json={"enabled": False},
    )
    async with api_context.session_factory() as session:
        stored_summaries = list(await session.scalars(select(ReadingDailySummary)))
        progress = await session.scalar(select(ReadingProgress))

    assert disabled.json()["enabled"] is False
    assert disabled.json()["total_reading_seconds"] == 0
    assert stored_summaries == []
    assert progress is not None
    assert progress.reading_seconds == 0


@pytest.mark.anyio
async def test_onboarding_rejects_duplicate_or_empty_reading_types(
    api_context: ApiTestContext,
) -> None:
    empty = await api_context.client.put(
        "/api/users/me/onboarding",
        json={
            "reading_types": [],
            "reading_goal": "COMPLETE",
            "display_preference": "CLEAN",
        },
    )
    duplicate = await api_context.client.put(
        "/api/users/me/onboarding",
        json={
            "reading_types": ["WORK", "WORK"],
            "reading_goal": "REFERENCE",
            "display_preference": "STUDY",
        },
    )

    assert empty.status_code == 422
    assert duplicate.status_code == 422

from typing import cast
from uuid import UUID

import pytest
from sqlalchemy import func, select

from app.api.dependencies import get_current_owner_id
from app.main import app
from app.models.keyword import Keyword, KeywordOccurrence
from app.services.processing import process_document_version
from tests.conftest import ApiTestContext
from tests.pdf_factory import TextSpec, make_pdf


async def seed_taxonomy(api_context: ApiTestContext) -> None:
    assert api_context.session_factory is not None
    rows = [
        Keyword(
            id=UUID("50000000-0000-0000-0000-000000000001"),
            canonical_name="Python",
            slug="python",
            category="PROGRAMMING_LANGUAGE",
            short_definition="A programming language.",
            beginner_explanation="Python is a programming language.",
            intermediate_explanation="Python supports multiple programming styles.",
            advanced_explanation="Python has a dynamic object model.",
            difficulty="BEGINNER",
            aliases=["Python 3"],
            related_keyword_ids=[],
            ambiguity_rules={},
            taxonomy_version="test-v1",
        ),
        Keyword(
            id=UUID("50000000-0000-0000-0000-000000000010"),
            canonical_name="AI agent",
            slug="ai-agent",
            category="AI_AGENT",
            short_definition="An AI system that uses tools.",
            beginner_explanation="An AI agent can choose actions.",
            intermediate_explanation="An AI agent combines planning and tools.",
            advanced_explanation="An AI agent runs a policy over observations and tools.",
            difficulty="ADVANCED",
            aliases=["agent"],
            related_keyword_ids=[],
            ambiguity_rules={"required_any": ["AI", "tool", "model"]},
            taxonomy_version="test-v1",
        ),
    ]
    async with api_context.session_factory() as session:
        session.add_all(rows)
        await session.commit()


async def create_processed_document(api_context: ApiTestContext) -> dict[str, object]:
    pdf = make_pdf(
        [
            [
                TextSpec("Keyword Guide", 72, 90, size=22, font="hebo"),
                TextSpec("Python 3 helps build services.", 72, 145),
                TextSpec("An AI agent can call a tool. Python is also popular.", 72, 195),
                TextSpec("A travel agent booked a hotel.", 72, 245),
            ]
        ]
    )
    response = await api_context.client.post(
        "/api/documents/upload",
        files={"file": ("keywords.pdf", pdf, "application/pdf")},
    )
    assert response.status_code == 201
    payload = cast(dict[str, object], response.json())
    versions = cast(list[dict[str, object]], payload["versions"])
    jobs = cast(list[dict[str, object]], payload["processing_jobs"])
    assert api_context.session_factory is not None
    await process_document_version(
        UUID(str(payload["id"])),
        UUID(str(versions[0]["id"])),
        UUID(str(jobs[0]["id"])),
        storage=api_context.storage,
        session_factory=api_context.session_factory,
    )
    return payload


@pytest.mark.anyio
async def test_keyword_api_preferences_detail_feedback_and_ownership(
    api_context: ApiTestContext,
) -> None:
    await seed_taxonomy(api_context)
    payload = await create_processed_document(api_context)
    document_id = payload["id"]

    listed = await api_context.client.get(f"/api/documents/{document_id}/keywords")
    assert listed.status_code == 200
    body = listed.json()
    assert body["taxonomy_version"] == "test-v1"
    assert {item["keyword"]["slug"] for item in body["items"]} == {"python", "ai-agent"}
    assert all(item["is_suppressed"] is False for item in body["items"])
    python_item = next(item for item in body["items"] if item["keyword"]["slug"] == "python")
    agent_item = next(item for item in body["items"] if item["keyword"]["slug"] == "ai-agent")

    occurrences = await api_context.client.get(
        f"/api/documents/{document_id}/keywords/{python_item['keyword']['id']}/occurrences"
    )
    assert occurrences.status_code == 200
    assert occurrences.json()["total"] == 1

    detail = await api_context.client.get(f"/api/keywords/{agent_item['keyword']['id']}")
    assert detail.status_code == 200
    assert detail.json()["explanation"] == "An AI agent can choose actions."

    feedback = await api_context.client.post(
        "/api/keyword-feedback",
        json={
            "document_id": document_id,
            "occurrence_id": agent_item["id"],
            "feedback_type": "HELPFUL",
        },
    )
    assert feedback.status_code == 200

    preference = await api_context.client.put(
        "/api/users/me/keyword-preferences",
        json={
            "enabled": True,
            "user_level": "ADVANCED",
            "enabled_categories": ["AI_AGENT"],
            "min_confidence": 0.8,
        },
    )
    assert preference.status_code == 200
    filtered = await api_context.client.get(f"/api/documents/{document_id}/keywords")
    assert [item["keyword"]["slug"] for item in filtered.json()["items"]] == ["ai-agent"]

    app.dependency_overrides[get_current_owner_id] = lambda: "different-owner"
    denied = await api_context.client.get(f"/api/documents/{document_id}/keywords")
    denied_feedback = await api_context.client.post(
        "/api/keyword-feedback",
        json={
            "document_id": document_id,
            "occurrence_id": agent_item["id"],
            "feedback_type": "HELPFUL",
        },
    )
    assert denied.status_code == 404
    assert denied_feedback.status_code == 404


@pytest.mark.anyio
async def test_keyword_detection_retry_is_idempotent_and_document_delete_cascades(
    api_context: ApiTestContext,
) -> None:
    await seed_taxonomy(api_context)
    payload = await create_processed_document(api_context)
    versions = cast(list[dict[str, object]], payload["versions"])
    jobs = cast(list[dict[str, object]], payload["processing_jobs"])
    assert api_context.session_factory is not None
    await process_document_version(
        UUID(str(payload["id"])),
        UUID(str(versions[0]["id"])),
        UUID(str(jobs[0]["id"])),
        storage=api_context.storage,
        session_factory=api_context.session_factory,
    )
    async with api_context.session_factory() as session:
        count_after_retry = await session.scalar(
            select(func.count()).select_from(KeywordOccurrence)
        )
    assert count_after_retry == 4

    deleted = await api_context.client.delete(f"/api/documents/{payload['id']}")
    assert deleted.status_code == 204
    async with api_context.session_factory() as session:
        count_after_delete = await session.scalar(
            select(func.count()).select_from(KeywordOccurrence)
        )
    assert count_after_delete == 0

from __future__ import annotations

from typing import cast
from uuid import UUID

import pytest

from app.services.processing import process_document_version
from app.services.reader import PROCESSING_STAGE_ORDER
from tests.conftest import ApiTestContext
from tests.pdf_factory import TextSpec, make_pdf


def processing_pdf() -> bytes:
    return make_pdf(
        [
            [
                TextSpec("Chapter 1. Processing", 72, 90, size=22, font="hebo"),
                TextSpec(
                    "A stable paragraph provides enough source text for processing.",
                    72,
                    150,
                ),
            ]
        ],
        toc=[[1, "Chapter 1. Processing", 1]],
    )


def test_processing_stage_contract_matches_required_flow() -> None:
    assert PROCESSING_STAGE_ORDER == (
        "UPLOADING",
        "SAFETY_CHECK",
        "EXTRACTING",
        "STRUCTURING",
        "READABLE",
        "TOC",
        "INDEXING",
        "COMPLETE",
    )


async def upload(api_context: ApiTestContext) -> dict[str, object]:
    response = await api_context.client.post(
        "/api/documents/upload",
        files={
            "file": (
                "processing.pdf",
                processing_pdf(),
                "application/pdf",
            )
        },
    )
    assert response.status_code == 201
    return cast(dict[str, object], response.json())


async def process(api_context: ApiTestContext, payload: dict[str, object]) -> None:
    versions = cast(list[dict[str, object]], payload["versions"])
    jobs = cast(list[dict[str, object]], payload["processing_jobs"])
    assert api_context.session_factory is not None
    await process_document_version(
        UUID(str(payload["id"])),
        UUID(str(versions[-1]["id"])),
        UUID(str(jobs[-1]["id"])),
        storage=api_context.storage,
        session_factory=api_context.session_factory,
    )


@pytest.mark.anyio
async def test_processing_result_exposes_detection_quality_and_counts(
    api_context: ApiTestContext,
) -> None:
    payload = await upload(api_context)
    await process(api_context, payload)

    response = await api_context.client.get(f"/api/documents/{payload['id']}")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "AI_READY"
    assert body["processing_jobs"][0]["status"] == "COMPLETE"
    result = body["processing_result"]
    assert result["detected_document_type"] in {
        "BOOK",
        "TEXTBOOK",
        "LECTURE",
        "RESEARCH_PAPER",
        "THESIS",
        "TECHNICAL",
        "REPORT",
        "LEGAL",
        "WORK",
        "WEB_ARTICLE",
        "OTHER",
    }
    assert result["effective_document_type"] == result["detected_document_type"]
    assert result["language"] in {"en", "vi", "und"}
    assert result["source_page_count"] == 1
    assert result["chapter_count"] == 1
    assert result["layout_quality"] in {"HIGH", "MEDIUM", "LOW"}
    assert 0 <= result["layout_quality_score"] <= 1
    assert isinstance(result["warnings"], list)


@pytest.mark.anyio
async def test_document_type_override_is_validated_and_can_be_cleared(
    api_context: ApiTestContext,
) -> None:
    payload = await upload(api_context)
    await process(api_context, payload)
    endpoint = f"/api/documents/{payload['id']}/document-type"

    invalid = await api_context.client.put(
        endpoint,
        json={"document_type_override": "invented"},
    )
    overridden = await api_context.client.put(
        endpoint,
        json={"document_type_override": "research_paper"},
    )
    cleared = await api_context.client.put(
        endpoint,
        json={"document_type_override": None},
    )

    assert invalid.status_code == 422
    assert overridden.status_code == 200
    assert overridden.json()["document_type_override"] == "RESEARCH_PAPER"
    assert overridden.json()["processing_result"]["effective_document_type"] == (
        "RESEARCH_PAPER"
    )
    assert overridden.json()["layout_type"] == "PAPER"
    assert cleared.status_code == 200
    assert cleared.json()["document_type_override"] is None
    assert cleared.json()["processing_result"]["effective_document_type"] == (
        cleared.json()["processing_result"]["detected_document_type"]
    )


@pytest.mark.anyio
async def test_reprocess_creates_new_version_and_preserves_original_version(
    api_context: ApiTestContext,
) -> None:
    payload = await upload(api_context)
    document_id = payload["id"]
    while_active = await api_context.client.post(
        f"/api/documents/{document_id}/reprocess"
    )
    await process(api_context, payload)
    original_storage_keys = set(api_context.storage.objects)

    response = await api_context.client.post(
        f"/api/documents/{document_id}/reprocess"
    )

    assert while_active.status_code == 409
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "SAFETY_CHECK"
    assert [version["version_number"] for version in body["versions"]] == [1, 2]
    assert len(api_context.storage.objects) == len(original_storage_keys) + 1
    assert sum(key.endswith("/original.pdf") for key in api_context.storage.objects) == 2
    assert sum(key.endswith("/cover.png") for key in api_context.storage.objects) == 1
    assert original_storage_keys.issubset(api_context.storage.objects)
    assert body["processing_jobs"][-1]["job_type"] == "document_reprocessing"
    assert body["processing_jobs"][-1]["status"] == "SAFETY_CHECK"
    assert len(api_context.queue.messages) == 2
    assert str(api_context.queue.messages[-1][1]) == body["versions"][-1]["id"]

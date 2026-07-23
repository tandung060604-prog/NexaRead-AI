from typing import cast

import pytest

from tests.conftest import ApiTestContext
from tests.test_annotations_api import readable_document, version_id


@pytest.mark.anyio
async def test_dashboard_aggregates_owned_reading_activity(
    api_context: ApiTestContext,
) -> None:
    document, block = await readable_document(api_context)
    document_id = str(document["id"])
    version = version_id(document)
    await api_context.client.put(
        f"/api/documents/{document_id}/progress",
        json={
            "document_version_id": version,
            "last_block_id": block["id"],
            "page_number": block["page_number"],
            "progress_percent": 45,
            "reading_mode": "clean",
        },
    )
    bookmark = await api_context.client.post(
        f"/api/documents/{document_id}/bookmarks",
        json={
            "document_version_id": version,
            "content_block_id": block["id"],
            "title": "Resume here",
        },
    )
    text = str(block["text"])
    highlight = await api_context.client.post(
        f"/api/documents/{document_id}/highlights",
        json={
            "document_version_id": version,
            "content_block_id": block["id"],
            "start_offset": 0,
            "end_offset": 8,
            "selected_text": text[:8],
        },
    )
    note = await api_context.client.post(
        f"/api/highlights/{highlight.json()['id']}/note",
        json={"content": "Review this concept"},
    )
    collection = await api_context.client.post(
        "/api/collections",
        json={"name": "Research"},
    )
    await api_context.client.patch(
        f"/api/documents/{document_id}/organization",
        json={"collection_id": collection.json()["id"]},
    )

    response = await api_context.client.get("/api/dashboard")
    payload = response.json()
    continue_reading = cast(list[dict[str, object]], payload["continue_reading"])

    assert response.status_code == 200
    assert continue_reading[0]["id"] == document_id
    assert continue_reading[0]["progress_percent"] == 45
    assert str(continue_reading[0]["cover_url"]).endswith(f"/{document_id}/cover")
    assert continue_reading[0]["last_chapter"] == "Reader Guide"
    assert continue_reading[0]["processing_status"] == "COMPLETE"
    assert payload["recent_bookmarks"][0]["id"] == bookmark.json()["id"]
    assert payload["recent_notes"][0]["id"] == note.json()["id"]
    assert payload["collections"] == [
        {
            "id": collection.json()["id"],
            "name": "Research",
            "document_count": 1,
        }
    ]
    assert payload["stats"] == {
        "total_documents": 1,
        "in_progress_documents": 1,
            "completed_documents": 0,
            "bookmark_count": 1,
            "note_count": 1,
            "analytics_enabled": False,
            "reading_time_seconds": 0,
            "reading_streak_days": 0,
            "source_pages_reached": 0,
        }


@pytest.mark.anyio
async def test_dashboard_is_empty_for_an_account_without_documents(
    api_context: ApiTestContext,
) -> None:
    response = await api_context.client.get("/api/dashboard")

    assert response.status_code == 200
    assert response.json()["recent_documents"] == []
    assert response.json()["stats"]["total_documents"] == 0

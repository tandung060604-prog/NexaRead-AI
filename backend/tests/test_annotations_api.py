from typing import cast
from uuid import UUID

import pytest
from sqlalchemy import func, select

from app.api.dependencies import get_current_owner_id
from app.main import app
from app.models.annotation import Bookmark, Highlight, Note, ReadingProgress
from tests.conftest import ApiTestContext
from tests.test_reader_api import process_upload, upload_document


async def readable_document(
    api_context: ApiTestContext,
) -> tuple[dict[str, object], dict[str, object]]:
    document = await upload_document(api_context)
    await process_upload(api_context, document)
    response = await api_context.client.get(f"/api/documents/{document['id']}/blocks")
    blocks = cast(list[dict[str, object]], response.json()["items"])
    return document, blocks[1]


def version_id(document: dict[str, object]) -> str:
    versions = cast(list[dict[str, object]], document["versions"])
    return str(versions[0]["id"])


@pytest.mark.anyio
async def test_progress_create_update_and_restore(api_context: ApiTestContext) -> None:
    document, block = await readable_document(api_context)
    endpoint = f"/api/documents/{document['id']}/progress"
    payload = {
        "document_version_id": version_id(document),
        "last_block_id": block["id"],
        "page_number": block["page_number"],
        "progress_percent": 40,
        "scroll_offset": 120,
        "reading_mode": "standard",
    }

    empty = await api_context.client.get(endpoint)
    created = await api_context.client.put(endpoint, json=payload)
    payload["progress_percent"] = 75
    updated = await api_context.client.put(endpoint, json=payload)
    restored = await api_context.client.get(endpoint)

    assert empty.status_code == 200 and empty.json() is None
    assert created.status_code == 200
    assert created.json()["id"] == updated.json()["id"]
    assert restored.json()["progress_percent"] == 75


@pytest.mark.anyio
async def test_progress_rejects_foreign_owner(api_context: ApiTestContext) -> None:
    document, block = await readable_document(api_context)
    app.dependency_overrides[get_current_owner_id] = lambda: "different-owner"

    response = await api_context.client.put(
        f"/api/documents/{document['id']}/progress",
        json={
            "document_version_id": version_id(document),
            "last_block_id": block["id"],
            "page_number": 1,
            "progress_percent": 10,
        },
    )

    assert response.status_code == 404


@pytest.mark.anyio
async def test_bookmark_create_is_idempotent_and_delete_works(
    api_context: ApiTestContext,
) -> None:
    document, block = await readable_document(api_context)
    endpoint = f"/api/documents/{document['id']}/bookmarks"
    payload = {
        "document_version_id": version_id(document),
        "content_block_id": block["id"],
        "title": "Important paragraph",
    }

    first = await api_context.client.post(endpoint, json=payload)
    second = await api_context.client.post(endpoint, json=payload)
    listed = await api_context.client.get(endpoint)
    deleted = await api_context.client.delete(f"/api/bookmarks/{first.json()['id']}")

    assert first.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert len(listed.json()["items"]) == 1
    assert deleted.status_code == 204
    assert (await api_context.client.get(endpoint)).json()["items"] == []


@pytest.mark.anyio
async def test_bookmark_rejects_block_from_another_document(api_context: ApiTestContext) -> None:
    first, _ = await readable_document(api_context)
    second, second_block = await readable_document(api_context)

    response = await api_context.client.post(
        f"/api/documents/{first['id']}/bookmarks",
        json={
            "document_version_id": version_id(first),
            "content_block_id": second_block["id"],
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_highlight_validates_offsets_and_selected_text(api_context: ApiTestContext) -> None:
    document, block = await readable_document(api_context)
    text = str(block["text"])
    start = text.index("embedded")
    endpoint = f"/api/documents/{document['id']}/highlights"
    base = {
        "document_version_id": version_id(document),
        "content_block_id": block["id"],
        "start_offset": start,
        "end_offset": start + len("embedded"),
        "selected_text": "embedded",
        "color": "green",
    }

    valid = await api_context.client.post(endpoint, json=base)
    invalid_offset = await api_context.client.post(
        endpoint, json={**base, "end_offset": len(text) + 1}
    )
    invalid_text = await api_context.client.post(
        endpoint, json={**base, "selected_text": "different"}
    )

    assert valid.status_code == 201
    assert valid.json()["selected_text"] == "embedded"
    assert invalid_offset.status_code == 422
    assert invalid_text.status_code == 422


@pytest.mark.anyio
async def test_highlight_rejects_wrong_document_version(api_context: ApiTestContext) -> None:
    first, first_block = await readable_document(api_context)
    second, _ = await readable_document(api_context)

    response = await api_context.client.post(
        f"/api/documents/{first['id']}/highlights",
        json={
            "document_version_id": version_id(second),
            "content_block_id": first_block["id"],
            "start_offset": 0,
            "end_offset": 6,
            "selected_text": str(first_block["text"])[:6],
        },
    )

    assert response.status_code == 404


@pytest.mark.anyio
async def test_highlight_update_and_delete_are_owner_isolated(api_context: ApiTestContext) -> None:
    document, block = await readable_document(api_context)
    text = str(block["text"])
    created = await api_context.client.post(
        f"/api/documents/{document['id']}/highlights",
        json={
            "document_version_id": version_id(document),
            "content_block_id": block["id"],
            "start_offset": 0,
            "end_offset": 8,
            "selected_text": text[:8],
        },
    )
    highlight_id = created.json()["id"]
    updated = await api_context.client.patch(
        f"/api/highlights/{highlight_id}", json={"color": "purple"}
    )
    app.dependency_overrides[get_current_owner_id] = lambda: "different-owner"
    denied = await api_context.client.delete(f"/api/highlights/{highlight_id}")

    assert updated.json()["color"] == "purple"
    assert denied.status_code == 404


@pytest.mark.anyio
async def test_note_create_update_delete(api_context: ApiTestContext) -> None:
    document, block = await readable_document(api_context)
    text = str(block["text"])
    highlight = await api_context.client.post(
        f"/api/documents/{document['id']}/highlights",
        json={
            "document_version_id": version_id(document),
            "content_block_id": block["id"],
            "start_offset": 0,
            "end_offset": 8,
            "selected_text": text[:8],
        },
    )
    highlight_id = highlight.json()["id"]

    created = await api_context.client.post(
        f"/api/highlights/{highlight_id}/note", json={"content": "First note"}
    )
    updated = await api_context.client.patch(
        f"/api/notes/{created.json()['id']}", json={"content": "Updated note"}
    )
    duplicate = await api_context.client.post(
        f"/api/highlights/{highlight_id}/note", json={"content": "Duplicate"}
    )
    deleted = await api_context.client.delete(f"/api/notes/{created.json()['id']}")

    assert created.status_code == 201
    assert updated.json()["content"] == "Updated note"
    assert duplicate.status_code == 409
    assert deleted.status_code == 204


@pytest.mark.anyio
async def test_preferences_persist(api_context: ApiTestContext) -> None:
    endpoint = "/api/users/me/reading-preferences"
    defaults = await api_context.client.get(endpoint)
    saved = await api_context.client.put(
        endpoint,
        json={
            "theme": "sepia",
            "font_size": 20,
            "line_height": 1.9,
            "reading_width": 800,
            "font_family": "serif",
            "focus_mode": True,
        },
    )
    restored = await api_context.client.get(endpoint)

    assert defaults.json()["theme"] == "light"
    assert saved.status_code == 200
    assert restored.json()["theme"] == "sepia"
    assert restored.json()["focus_mode"] is True


@pytest.mark.anyio
async def test_annotations_cascade_when_document_is_deleted(api_context: ApiTestContext) -> None:
    document, block = await readable_document(api_context)
    progress = {
        "document_version_id": version_id(document),
        "last_block_id": block["id"],
        "page_number": 1,
        "progress_percent": 20,
    }
    await api_context.client.put(f"/api/documents/{document['id']}/progress", json=progress)
    bookmark = await api_context.client.post(
        f"/api/documents/{document['id']}/bookmarks",
        json={
            "document_version_id": version_id(document),
            "content_block_id": block["id"],
        },
    )
    text = str(block["text"])
    highlight = await api_context.client.post(
        f"/api/documents/{document['id']}/highlights",
        json={
            "document_version_id": version_id(document),
            "content_block_id": block["id"],
            "start_offset": 0,
            "end_offset": 8,
            "selected_text": text[:8],
        },
    )
    await api_context.client.post(
        f"/api/highlights/{highlight.json()['id']}/note", json={"content": "Cascade"}
    )

    deleted = await api_context.client.delete(f"/api/documents/{document['id']}")
    assert deleted.status_code == 204
    assert bookmark.status_code == 201
    assert api_context.session_factory is not None
    async with api_context.session_factory() as session:
        counts = [
            await session.scalar(select(func.count()).select_from(model))
            for model in (ReadingProgress, Bookmark, Highlight, Note)
        ]
    assert counts == [0, 0, 0, 0]


@pytest.mark.anyio
async def test_foreign_user_cannot_read_annotations(api_context: ApiTestContext) -> None:
    document, _ = await readable_document(api_context)
    document_id = UUID(str(document["id"]))
    app.dependency_overrides[get_current_owner_id] = lambda: "different-owner"

    responses = [
        await api_context.client.get(f"/api/documents/{document_id}/progress"),
        await api_context.client.get(f"/api/documents/{document_id}/bookmarks"),
        await api_context.client.get(f"/api/documents/{document_id}/highlights"),
    ]

    assert all(response.status_code == 404 for response in responses)

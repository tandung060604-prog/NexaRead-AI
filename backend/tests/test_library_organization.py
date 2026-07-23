from typing import cast
from uuid import uuid4

import pytest

from app.models.auth import User
from app.models.document import Collection
from tests.conftest import TEST_OWNER_ID, ApiTestContext
from tests.test_annotations_api import readable_document, version_id


@pytest.mark.anyio
async def test_library_search_filters_sort_and_organization(
    api_context: ApiTestContext,
) -> None:
    document, block = await readable_document(api_context)
    document_id = str(document["id"])
    collection_response = await api_context.client.post(
        "/api/collections",
        json={"name": "AI Research"},
    )
    tag_response = await api_context.client.post(
        "/api/tags",
        json={"name": "RAG"},
    )
    collection = collection_response.json()
    tag = tag_response.json()
    organized = await api_context.client.patch(
        f"/api/documents/{document_id}/organization",
        json={
            "collection_id": collection["id"],
            "tag_ids": [tag["id"]],
        },
    )
    await api_context.client.put(
        f"/api/documents/{document_id}/progress",
        json={
            "document_version_id": version_id(document),
            "last_block_id": block["id"],
            "page_number": block["page_number"],
            "progress_percent": 60,
            "reading_mode": "clean",
        },
    )

    response = await api_context.client.get(
        "/api/documents",
        params={
            "search": "reader",
            "sort": "progress",
            "source_type": "pdf",
            "collection_id": collection["id"],
            "tag_id": tag["id"],
            "language": "en",
            "completion": "in_progress",
        },
    )
    payload = response.json()
    items = cast(list[dict[str, object]], payload["items"])

    assert collection_response.status_code == 201
    assert tag_response.status_code == 201
    assert organized.status_code == 200
    assert organized.json()["collection"]["name"] == "AI Research"
    assert organized.json()["tags"][0]["name"] == "RAG"
    assert response.status_code == 200
    assert payload["total"] == 1
    assert items[0]["id"] == document_id
    assert items[0]["progress_percent"] == 60
    assert items[0]["language"] == "en"


@pytest.mark.anyio
async def test_archive_is_hidden_by_default_and_can_be_restored(
    api_context: ApiTestContext,
) -> None:
    document, _ = await readable_document(api_context)
    endpoint = f"/api/documents/{document['id']}/organization"

    archived = await api_context.client.patch(endpoint, json={"archived": True})
    default_list = await api_context.client.get("/api/documents")
    archive_list = await api_context.client.get(
        "/api/documents",
        params={"archived": "true"},
    )
    restored = await api_context.client.patch(endpoint, json={"archived": False})

    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert default_list.json()["total"] == 0
    assert archive_list.json()["total"] == 1
    assert restored.json()["archived_at"] is None


@pytest.mark.anyio
async def test_collection_names_are_unique_per_owner_and_delete_unassigns_documents(
    api_context: ApiTestContext,
) -> None:
    document, _ = await readable_document(api_context)
    created = await api_context.client.post(
        "/api/collections",
        json={"name": "Course Work"},
    )
    duplicate = await api_context.client.post(
        "/api/collections",
        json={"name": " course   work "},
    )
    collection_id = created.json()["id"]
    await api_context.client.patch(
        f"/api/documents/{document['id']}/organization",
        json={"collection_id": collection_id},
    )
    removed = await api_context.client.delete(f"/api/collections/{collection_id}")
    listed = await api_context.client.get("/api/documents")

    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "LIBRARY_NAME_ALREADY_EXISTS"
    assert removed.status_code == 204
    assert listed.json()["items"][0]["collection"] is None


@pytest.mark.anyio
async def test_document_cannot_use_another_accounts_collection(
    api_context: ApiTestContext,
) -> None:
    document, _ = await readable_document(api_context)
    assert api_context.session_factory is not None
    foreign_owner_id = "foreign-library-owner"
    foreign_collection_id = uuid4()
    async with api_context.session_factory() as session:
        session.add(
            User(
                id=foreign_owner_id,
                email="foreign-library@example.com",
                normalized_email="foreign-library@example.com",
                display_name="Foreign library user",
                password_hash="!disabled!",
                is_active=False,
            )
        )
        session.add(
            Collection(
                id=foreign_collection_id,
                owner_id=foreign_owner_id,
                name="Private",
                normalized_name="private",
            )
        )
        await session.commit()

    response = await api_context.client.patch(
        f"/api/documents/{document['id']}/organization",
        json={"collection_id": str(foreign_collection_id)},
    )
    collections = await api_context.client.get("/api/collections")

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "LIBRARY_RESOURCE_NOT_FOUND"
    assert all(
        item["id"] != str(foreign_collection_id)
        for item in cast(list[dict[str, object]], collections.json())
    )
    assert TEST_OWNER_ID != foreign_owner_id

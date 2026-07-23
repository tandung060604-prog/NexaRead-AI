from uuid import uuid4

import httpx
import pytest

from app.api.dependencies import get_current_owner_id
from app.core.config import get_settings
from app.main import app
from tests.conftest import ApiTestContext

PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"


async def upload_pdf(
    client: httpx.AsyncClient,
    filename: str = "report.pdf",
    data: bytes = PDF_BYTES,
    content_type: str = "application/pdf",
) -> httpx.Response:
    return await client.post(
        "/api/documents/upload",
        files={"file": (filename, data, content_type)},
    )


@pytest.mark.anyio
async def test_upload_valid_pdf(api_context: ApiTestContext) -> None:
    response = await upload_pdf(api_context.client, "../../Quarterly Report.pdf")

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Quarterly Report"
    assert body["original_filename"] == "Quarterly Report.pdf"
    assert body["mime_type"] == "application/pdf"
    assert body["file_size"] == len(PDF_BYTES)
    assert body["status"] == "SAFETY_CHECK"
    assert body["versions"][0]["version_number"] == 1
    assert body["processing_jobs"][0]["status"] == "SAFETY_CHECK"
    assert body["processing_jobs"][0]["progress"] == 10
    assert body["processing_result"] is None
    assert len(api_context.queue.messages) == 1
    storage_key = next(iter(api_context.storage.objects))
    assert storage_key.startswith(f"documents/{body['id']}/versions/")
    assert storage_key.endswith("/original.pdf")
    assert "Quarterly Report.pdf" not in storage_key


@pytest.mark.anyio
async def test_upload_applies_document_type_and_owned_collection(
    api_context: ApiTestContext,
) -> None:
    collection = await api_context.client.post(
        "/api/collections",
        json={"name": "Research papers"},
    )

    response = await api_context.client.post(
        "/api/documents/upload",
        data={
            "document_type_override": "research_paper",
            "collection_id": collection.json()["id"],
        },
        files={"file": ("paper.pdf", PDF_BYTES, "application/pdf")},
    )

    assert collection.status_code == 201
    assert response.status_code == 201
    assert response.json()["collection_id"] == collection.json()["id"]
    assert response.json()["document_type_override"] == "RESEARCH_PAPER"
    assert response.json()["layout_type"] == "PAPER"


@pytest.mark.anyio
async def test_upload_rejects_unowned_or_unknown_collection_before_storage(
    api_context: ApiTestContext,
) -> None:
    response = await api_context.client.post(
        "/api/documents/upload",
        data={"collection_id": str(uuid4())},
        files={"file": ("paper.pdf", PDF_BYTES, "application/pdf")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Collection not found"
    assert api_context.storage.objects == {}
    assert api_context.queue.messages == []


@pytest.mark.anyio
async def test_rejects_non_pdf_content(api_context: ApiTestContext) -> None:
    response = await upload_pdf(
        api_context.client,
        filename="not-really.pdf",
        data=b"plain text",
        content_type="application/pdf",
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "File content is not a valid PDF"


@pytest.mark.anyio
async def test_rejects_empty_pdf(api_context: ApiTestContext) -> None:
    response = await upload_pdf(api_context.client, data=b"")

    assert response.status_code == 400
    assert response.json()["detail"] == "PDF file must not be empty"


@pytest.mark.anyio
async def test_rejects_pdf_over_size_limit(api_context: ApiTestContext) -> None:
    settings = get_settings()
    original_limit = settings.max_upload_size_mb
    settings.max_upload_size_mb = 1
    oversized_pdf = b"%PDF-1.4\n" + b"0" * (1024 * 1024)

    try:
        response = await upload_pdf(api_context.client, data=oversized_pdf)
    finally:
        settings.max_upload_size_mb = original_limit

    assert response.status_code == 400
    assert "size limit" in response.json()["detail"]


@pytest.mark.anyio
async def test_lists_documents(api_context: ApiTestContext) -> None:
    await upload_pdf(api_context.client, "first.pdf")
    await upload_pdf(api_context.client, "second.pdf")

    response = await api_context.client.get("/api/documents?limit=1&offset=0")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["limit"] == 1
    assert body["offset"] == 0
    assert len(body["items"]) == 1


@pytest.mark.anyio
async def test_gets_document_detail(api_context: ApiTestContext) -> None:
    uploaded = await upload_pdf(api_context.client)
    document_id = uploaded.json()["id"]

    response = await api_context.client.get(f"/api/documents/{document_id}")

    assert response.status_code == 200
    assert response.json()["id"] == document_id
    assert len(response.json()["versions"]) == 1


@pytest.mark.anyio
async def test_renames_document(api_context: ApiTestContext) -> None:
    uploaded = await upload_pdf(api_context.client)
    document_id = uploaded.json()["id"]

    response = await api_context.client.patch(
        f"/api/documents/{document_id}", json={"title": "  Updated   title  "}
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Updated title"


@pytest.mark.anyio
async def test_deletes_document_and_stored_object(api_context: ApiTestContext) -> None:
    uploaded = await upload_pdf(api_context.client)
    document_id = uploaded.json()["id"]
    assert api_context.storage.objects

    response = await api_context.client.delete(f"/api/documents/{document_id}")

    assert response.status_code == 204
    assert api_context.storage.objects == {}
    detail = await api_context.client.get(f"/api/documents/{document_id}")
    assert detail.status_code == 404


@pytest.mark.anyio
async def test_owner_cannot_access_another_owners_document(
    api_context: ApiTestContext,
) -> None:
    uploaded = await upload_pdf(api_context.client)
    document_id = uploaded.json()["id"]

    def other_owner() -> str:
        return "another-local-owner"

    app.dependency_overrides[get_current_owner_id] = other_owner
    response = await api_context.client.get(f"/api/documents/{document_id}")

    assert response.status_code == 404


@pytest.mark.anyio
async def test_storage_failure_rolls_back_document(api_context: ApiTestContext) -> None:
    api_context.storage.fail_upload = True

    response = await upload_pdf(api_context.client)
    listing = await api_context.client.get("/api/documents")

    assert response.status_code == 503
    assert response.json() == {"detail": "Document storage operation failed"}
    assert listing.json()["total"] == 0

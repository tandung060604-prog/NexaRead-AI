from typing import cast
from uuid import UUID

import pytest
from sqlalchemy import select

from app.api.dependencies import get_current_owner_id
from app.main import app
from app.models.document import ContentBlock
from app.services.processing import process_document_version
from tests.conftest import ApiTestContext
from tests.pdf_factory import TextSpec, make_pdf


def reader_pdf(*, with_toc: bool = True) -> bytes:
    toc = [[1, "Reader Guide", 1]] if with_toc else None
    return make_pdf(
        [
            [
                TextSpec("Reader Guide", 72, 90, size=22, font="hebo"),
                TextSpec("NexaRead extracts embedded text into stable content blocks.", 72, 145),
                TextSpec("Search can find a unique lexical phrase inside this paragraph.", 72, 195),
            ]
        ],
        toc=toc,
    )


async def upload_document(
    api_context: ApiTestContext, pdf: bytes | None = None
) -> dict[str, object]:
    response = await api_context.client.post(
        "/api/documents/upload",
        files={"file": ("reader-guide.pdf", pdf or reader_pdf(), "application/pdf")},
    )
    assert response.status_code == 201
    return cast(dict[str, object], response.json())


async def process_upload(api_context: ApiTestContext, payload: dict[str, object]) -> None:
    versions = payload["versions"]
    jobs = payload["processing_jobs"]
    assert isinstance(versions, list) and isinstance(jobs, list)
    assert api_context.session_factory is not None
    await process_document_version(
        document_id=UUID(str(payload["id"])),
        version_id=UUID(str(versions[0]["id"])),
        job_id=UUID(str(jobs[0]["id"])),
        storage=api_context.storage,
        session_factory=api_context.session_factory,
    )


@pytest.mark.anyio
async def test_processing_status(api_context: ApiTestContext) -> None:
    payload = await upload_document(api_context)
    document_id = payload["id"]
    queued = await api_context.client.get(f"/api/documents/{document_id}/processing-status")
    await process_upload(api_context, payload)
    readable = await api_context.client.get(f"/api/documents/{document_id}/processing-status")

    assert queued.json()["status"] == "SAFETY_CHECK"
    assert queued.json()["stage"] == "SAFETY_CHECK"
    assert queued.json()["completed_stages"] == ["UPLOADING"]
    assert readable.json()["status"] == "AI_READY"
    assert readable.json()["stage"] == "COMPLETE"
    assert readable.json()["completed_stages"] == [
        "UPLOADING",
        "SAFETY_CHECK",
        "EXTRACTING",
        "STRUCTURING",
        "READABLE",
        "TOC",
        "INDEXING",
        "COMPLETE",
    ]
    assert readable.json()["progress"] == 100
    assert readable.json()["page_count"] == 1


@pytest.mark.anyio
async def test_get_toc_prefers_pdf_outline(api_context: ApiTestContext) -> None:
    payload = await upload_document(api_context)
    await process_upload(api_context, payload)

    response = await api_context.client.get(f"/api/documents/{payload['id']}/toc")

    assert response.status_code == 200
    assert response.json()["items"][0]["title"] == "Reader Guide"
    assert response.json()["items"][0]["level"] == 1
    assert response.json()["items"][0]["block_id"]


@pytest.mark.anyio
async def test_get_blocks_in_reading_order(api_context: ApiTestContext) -> None:
    payload = await upload_document(api_context)
    await process_upload(api_context, payload)

    response = await api_context.client.get(f"/api/documents/{payload['id']}/blocks")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert body["items"][0]["text"] == "Reader Guide"
    assert body["items"][0]["source_text"] == body["items"][0]["text"]
    assert body["items"][0]["display_text"] == body["items"][0]["text"]
    assert body["items"][0]["transformation_log"] == []
    assert body["items"][0]["transformation_confidence"] == 1.0
    assert body["items"][0]["needs_review"] is False
    assert body["items"][0]["semantic_role"] == "heading"
    assert body["items"][0]["heading_level"] == 1
    assert body["items"][0]["keep_with_next"] is True
    assert body["items"][0]["break_before"] is True
    assert body["items"][0]["source_page_number"] == 1
    assert body["items"][0]["source_anchor"] == {
        "page_number": 1,
        "bounding_box": body["items"][0]["bounding_box"],
        "parser_block_ids": ["page-1-block-1"],
        "source_block_ids": [body["items"][0]["id"]],
        "source_start_offset": body["items"][0]["start_offset"],
        "source_end_offset": body["items"][0]["end_offset"],
    }
    assert body["items"][0]["bounding_box"]
    assert body["items"][0]["content_hash"]


@pytest.mark.anyio
async def test_blocks_pagination(api_context: ApiTestContext) -> None:
    payload = await upload_document(api_context)
    await process_upload(api_context, payload)

    response = await api_context.client.get(
        f"/api/documents/{payload['id']}/blocks?limit=1&offset=1"
    )

    body = response.json()
    assert body["total"] == 3
    assert body["limit"] == 1
    assert body["offset"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["sequence_number"] == 2


@pytest.mark.anyio
async def test_get_page(api_context: ApiTestContext) -> None:
    payload = await upload_document(api_context)
    await process_upload(api_context, payload)

    response = await api_context.client.get(f"/api/documents/{payload['id']}/pages/1")

    body = response.json()
    assert response.status_code == 200
    assert body["page_number"] == 1
    assert body["width"] == pytest.approx(595)
    assert body["word_count"] > 10
    assert len(body["blocks"]) == 3


@pytest.mark.anyio
async def test_lexical_search(api_context: ApiTestContext) -> None:
    payload = await upload_document(api_context)
    await process_upload(api_context, payload)

    response = await api_context.client.get(
        f"/api/documents/{payload['id']}/search?q=unique%20lexical"
    )

    body = response.json()
    assert response.status_code == 200
    assert body["total"] == 1
    assert "unique lexical" in body["items"][0]["text"]


@pytest.mark.anyio
async def test_document_not_yet_readable(api_context: ApiTestContext) -> None:
    payload = await upload_document(api_context)

    response = await api_context.client.get(f"/api/documents/{payload['id']}/blocks")

    assert response.status_code == 409
    assert "SAFETY_CHECK" in response.json()["detail"]


@pytest.mark.anyio
async def test_failed_document_has_safe_state(api_context: ApiTestContext) -> None:
    payload = await upload_document(api_context, b"%PDF-1.7\nthis fixture is intentionally damaged")
    await process_upload(api_context, payload)

    status_response = await api_context.client.get(
        f"/api/documents/{payload['id']}/processing-status"
    )
    blocks_response = await api_context.client.get(f"/api/documents/{payload['id']}/blocks")

    status_body = status_response.json()
    assert status_body["status"] == "FAILED"
    assert status_body["error_code"] in {"PDF_DAMAGED", "PDF_EMPTY", "PDF_PARSE_FAILED"}
    assert "traceback" not in str(status_body).lower()
    assert blocks_response.status_code == 409


@pytest.mark.anyio
async def test_reader_endpoints_enforce_ownership(api_context: ApiTestContext) -> None:
    payload = await upload_document(api_context)
    await process_upload(api_context, payload)
    app.dependency_overrides[get_current_owner_id] = lambda: "different-owner"

    responses = [
        await api_context.client.get(f"/api/documents/{payload['id']}/processing-status"),
        await api_context.client.get(f"/api/documents/{payload['id']}/toc"),
        await api_context.client.get(f"/api/documents/{payload['id']}/blocks"),
        await api_context.client.get(f"/api/documents/{payload['id']}/pages/1"),
        await api_context.client.get(f"/api/documents/{payload['id']}/search?q=reader"),
    ]

    assert all(response.status_code == 404 for response in responses)


@pytest.mark.anyio
async def test_original_pdf_access_control(api_context: ApiTestContext) -> None:
    original = reader_pdf()
    payload = await upload_document(api_context, original)

    allowed = await api_context.client.get(f"/api/documents/{payload['id']}/original")
    app.dependency_overrides[get_current_owner_id] = lambda: "different-owner"
    denied = await api_context.client.get(f"/api/documents/{payload['id']}/original")

    assert allowed.status_code == 200
    assert allowed.headers["content-type"] == "application/pdf"
    assert allowed.content == original
    assert denied.status_code == 404


@pytest.mark.anyio
async def test_protected_block_image_access_control(api_context: ApiTestContext) -> None:
    payload = await upload_document(api_context)
    await process_upload(api_context, payload)
    blocks_response = await api_context.client.get(f"/api/documents/{payload['id']}/blocks")
    block_id = UUID(blocks_response.json()["items"][1]["id"])
    versions = payload["versions"]
    assert isinstance(versions, list)
    version_id = UUID(str(versions[0]["id"]))
    storage_key = f"derived/{version_id}/images/{block_id}.png"
    image_bytes = b"\x89PNG\r\n\x1a\nsynthetic"
    assert api_context.session_factory is not None
    async with api_context.session_factory() as session:
        block = await session.scalar(select(ContentBlock).where(ContentBlock.id == block_id))
        assert block is not None
        block.block_type = "IMAGE"
        block.block_metadata = {"storage_key": storage_key, "media_type": "image/png"}
        await session.commit()
    api_context.storage.objects[storage_key] = image_bytes

    allowed = await api_context.client.get(f"/api/documents/content-blocks/{block_id}/image")
    app.dependency_overrides[get_current_owner_id] = lambda: "different-owner"
    denied = await api_context.client.get(f"/api/documents/content-blocks/{block_id}/image")

    assert allowed.status_code == 200
    assert allowed.headers["content-type"] == "image/png"
    assert allowed.content == image_bytes
    assert denied.status_code == 404

# mypy: disable-error-code="no-untyped-call,no-any-return"

from io import BytesIO

import pymupdf
import pytest
from ebooklib import epub  # type: ignore[import-untyped]

from app.api.dependencies import get_current_owner_id
from app.main import app
from app.services.document_cover import generate_document_cover, generated_cover
from tests.conftest import TEST_OWNER_ID, ApiTestContext
from tests.pdf_factory import TextSpec, make_pdf
from tests.test_reader_api import process_upload, upload_document


def _png_fixture() -> bytes:
    svg = (
        b'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320">'
        b'<rect width="240" height="320" fill="#315e52"/>'
        b'<circle cx="120" cy="120" r="70" fill="#e9c46a"/></svg>'
    )
    with pymupdf.open(stream=svg, filetype="svg") as image:
        return image[0].get_pixmap(alpha=False).tobytes("png")


def _epub_with_cover() -> bytes:
    book = epub.EpubBook()
    book.set_identifier("nexaread-cover-test")
    book.set_title("Covered EPUB")
    book.set_language("en")
    book.add_author("NexaRead Tests")
    book.set_cover("images/cover.png", _png_fixture())
    chapter = epub.EpubHtml(title="Chapter", file_name="chapter.xhtml", lang="en")
    chapter.content = "<h1>Chapter</h1><p>Readable source content.</p>"
    book.add_item(chapter)
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav", chapter]
    output = BytesIO()
    epub.write_epub(output, book)
    return output.getvalue()


def test_generated_cover_is_deterministic_and_escapes_untrusted_metadata() -> None:
    first = generated_cover(
        title="<script>alert(1)</script>",
        author="A & B",
        document_type="TECHNICAL",
    )
    second = generated_cover(
        title="<script>alert(1)</script>",
        author="A & B",
        document_type="TECHNICAL",
    )

    assert first == second
    assert first.media_type == "image/svg+xml"
    assert first.source == "generated"
    assert b"<script>" not in first.data
    assert b"&lt;script&gt;" in first.data
    assert b"A &amp; B" in first.data


def test_pdf_first_page_is_preferred_and_rendered_as_bounded_png() -> None:
    document = make_pdf(
        [[TextSpec("A document cover", 72, 120, size=28)]],
        metadata={"author": "NexaRead Tests"},
    )

    cover = generate_document_cover(
        document,
        source_type="pdf",
        title="A document cover",
        document_type="REPORT",
    )

    assert cover.source == "pdf_first_page"
    assert cover.media_type == "image/png"
    assert cover.data.startswith(b"\x89PNG")
    with pymupdf.open(stream=cover.data, filetype="png") as image:
        assert image[0].rect.width <= 480
        assert image[0].rect.height <= 640


def test_epub_explicit_cover_has_priority() -> None:
    cover = generate_document_cover(
        _epub_with_cover(),
        source_type="epub",
        title="Covered EPUB",
        document_type="BOOK",
    )

    assert cover.source == "epub_cover"
    assert cover.media_type == "image/png"


@pytest.mark.anyio
async def test_processing_caches_cover_and_owned_endpoint_serves_it(
    api_context: ApiTestContext,
) -> None:
    document = await upload_document(api_context)
    await process_upload(api_context, document)
    document_id = str(document["id"])

    response = await api_context.client.get(f"/api/documents/{document_id}/cover")
    detail = await api_context.client.get(f"/api/documents/{document_id}")
    cover_keys = [
        key
        for key in api_context.storage.objects
        if key.endswith("/cover.png")
    ]

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")
    assert response.headers["x-nexaread-cover-source"] == "pdf_first_page"
    assert response.content.startswith(b"\x89PNG")
    assert detail.json()["versions"][0]["cover_source"] == "pdf_first_page"
    assert len(cover_keys) == 1

    app.dependency_overrides[get_current_owner_id] = lambda: "another-owner"
    foreign = await api_context.client.get(f"/api/documents/{document_id}/cover")
    app.dependency_overrides[get_current_owner_id] = lambda: TEST_OWNER_ID
    removed = await api_context.client.delete(f"/api/documents/{document_id}")

    assert foreign.status_code == 404
    assert removed.status_code == 204
    assert not api_context.storage.objects

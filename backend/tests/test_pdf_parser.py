from uuid import UUID

import pytest

from app.services.pdf_parser import BlockType, PdfNeedsOcrError, PdfParseError, parse_pdf
from app.services.processing import process_document_version
from tests.conftest import ApiTestContext
from tests.pdf_factory import TextSpec, make_blank_pdf, make_pdf


def body(text: str, y: float = 100) -> TextSpec:
    return TextSpec(text=text, x=72, y=y)


def test_extracts_one_page_with_metadata() -> None:
    pdf = make_pdf(
        [[body("A complete paragraph with enough embedded text for extraction.")]],
        metadata={"title": "Fixture title", "author": "NexaRead tests"},
    )

    parsed = parse_pdf(pdf)

    assert parsed.page_count == 1
    assert parsed.metadata["title"] == "Fixture title"
    assert parsed.pages[0].width == pytest.approx(595)
    assert parsed.pages[0].height == pytest.approx(842)
    assert parsed.pages[0].word_count >= 8
    assert parsed.blocks[0].bounding_box[2] > parsed.blocks[0].bounding_box[0]


def test_extracts_multiple_pages_in_order() -> None:
    pdf = make_pdf(
        [
            [body("First page contains enough readable text for the parser.")],
            [body("Second page follows and remains in document reading order.")],
        ]
    )

    parsed = parse_pdf(pdf)

    assert parsed.page_count == 2
    assert [page.page_number for page in parsed.pages] == [1, 2]
    assert any(block.block_type == BlockType.PAGE_BREAK for block in parsed.blocks)
    assert parsed.pages[1].blocks[0].sequence_number > parsed.pages[0].blocks[0].sequence_number


def test_detects_heading_from_font_and_boldness() -> None:
    pdf = make_pdf(
        [
            [
                TextSpec("1 Introduction", 72, 90, size=22, font="hebo"),
                body(
                    "This paragraph establishes the body font and supplies readable content.", 145
                ),
                body("A second paragraph provides a stable body-size baseline.", 190),
            ]
        ]
    )

    parsed = parse_pdf(pdf)

    heading = parsed.blocks[0]
    assert heading.block_type in {BlockType.HEADING_1, BlockType.HEADING_2}
    assert heading.is_bold is True
    assert heading.confidence >= 0.8


def test_plain_document_has_no_heading() -> None:
    pdf = make_pdf(
        [
            [
                body("This ordinary paragraph is neither bold nor unusually large.", 100),
                body("Another ordinary paragraph remains body content without a heading.", 145),
            ]
        ]
    )

    parsed = parse_pdf(pdf)

    assert all(not block.block_type.value.startswith("HEADING_") for block in parsed.blocks)


def test_preserves_vietnamese_unicode() -> None:
    text = "Tiếng Việt được giữ nguyên: Trường đại học và kiến thức."
    pdf = make_pdf([[TextSpec(text, 72, 100, unicode_font=True)]])

    parsed = parse_pdf(pdf)

    assert parsed.blocks[0].text == text


def test_blank_or_scanned_pdf_requires_ocr() -> None:
    with pytest.raises(PdfNeedsOcrError) as error:
        parse_pdf(make_blank_pdf())

    assert error.value.code == "OCR_REQUIRED"


def test_damaged_pdf_returns_safe_error_code() -> None:
    with pytest.raises(PdfParseError) as error:
        parse_pdf(b"%PDF-1.7\nthis is not a complete PDF")

    assert error.value.code in {"PDF_DAMAGED", "PDF_EMPTY", "PDF_PARSE_FAILED"}
    assert str(error.value) == "PDF extraction failed"


def test_marks_repeated_headers_and_footers_as_suppressed() -> None:
    pages = []
    for index in range(3):
        pages.append(
            [
                TextSpec("NexaRead confidential", 72, 40, size=9),
                body(f"Page {index + 1} has unique readable body content for extraction.", 180),
                TextSpec("Internal footer", 72, 810, size=9),
            ]
        )
    parsed = parse_pdf(make_pdf(pages))

    repeated = [block for block in parsed.blocks if block.metadata.get("repeated_margin")]
    assert len(repeated) == 6
    assert all(block.metadata["suppressed"] is True for block in repeated)
    assert "NexaRead confidential" not in parsed.pages[0].text


def test_repeated_margins_without_body_text_require_ocr() -> None:
    pages = [
        [
            TextSpec("Scanned archive header", 72, 40, size=9),
            TextSpec("Scanned archive footer", 72, 810, size=9),
        ]
        for _ in range(3)
    ]

    with pytest.raises(PdfNeedsOcrError):
        parse_pdf(make_pdf(pages))


def test_orders_clear_two_column_layout_left_then_right() -> None:
    pdf = make_pdf(
        [
            [
                TextSpec("Right column first insertion with enough words.", 330, 120),
                TextSpec("Right column second insertion with enough words.", 330, 180),
                TextSpec("Left column first reading block with enough words.", 60, 120),
                TextSpec("Left column second reading block with enough words.", 60, 180),
            ]
        ]
    )

    parsed = parse_pdf(pdf)
    texts = [block.text for block in parsed.blocks if block.block_type != BlockType.PAGE_BREAK]

    assert texts[0].startswith("Left column first")
    assert texts[2].startswith("Right column first")
    assert all(block.metadata.get("reading_order") == "two_column" for block in parsed.blocks)


@pytest.mark.anyio
async def test_retry_replaces_blocks_without_duplicates(api_context: ApiTestContext) -> None:
    pdf = make_pdf(
        [
            [
                TextSpec("Retry Safety", 72, 90, size=20, font="hebo"),
                body(
                    "The same version can be processed repeatedly without duplicate content.", 145
                ),
            ]
        ]
    )
    upload = await api_context.client.post(
        "/api/documents/upload",
        files={"file": ("retry.pdf", pdf, "application/pdf")},
    )
    payload = upload.json()
    document_id = payload["id"]
    version_id = payload["versions"][0]["id"]
    job_id = payload["processing_jobs"][0]["id"]
    assert api_context.session_factory is not None

    for _ in range(2):
        await process_document_version(
            document_id=UUID(document_id),
            version_id=UUID(version_id),
            job_id=UUID(job_id),
            storage=api_context.storage,
            session_factory=api_context.session_factory,
        )
    response = await api_context.client.get(f"/api/documents/{document_id}/blocks?limit=200")

    assert response.status_code == 200
    assert response.json()["total"] == 2

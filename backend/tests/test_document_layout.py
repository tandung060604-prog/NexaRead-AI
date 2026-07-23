import pytest

from app.services.document_layout.caption_detection import detect_caption
from app.services.document_layout.footnote_detection import detect_footnote
from app.services.document_layout.heading_detection import detect_heading
from app.services.document_layout.language import detect_language
from app.services.document_layout.list_detection import detect_list_item
from app.services.document_layout.pipeline import (
    LAYOUT_PIPELINE_VERSION,
    normalize_document_layout,
)
from app.services.document_layout.vietnamese_normalizer import (
    normalize_vietnamese_display,
)
from app.services.normalized_document import (
    BlockType,
    NormalizedDocument,
    ParsedBlock,
    ParsedPage,
    block_hash,
)


def make_block(
    sequence: int,
    text: str,
    *,
    block_type: BlockType = BlockType.PARAGRAPH,
    page_number: int = 1,
    bbox: list[float] | None = None,
    font_size: float | None = 11,
    metadata: dict[str, object] | None = None,
) -> ParsedBlock:
    return ParsedBlock(
        sequence_number=sequence,
        block_type=block_type,
        text=text,
        page_number=page_number,
        chapter_index=None,
        section_index=None,
        paragraph_index=sequence,
        start_offset=(sequence - 1) * 100,
        end_offset=(sequence - 1) * 100 + len(text),
        bounding_box=bbox or [72.0, 100.0 + sequence * 30, 500.0, 125.0 + sequence * 30],
        font_name="Noto Sans",
        font_size=font_size,
        is_bold=block_type.name.startswith("HEADING"),
        is_italic=False,
        confidence=0.98,
        metadata=metadata or {},
        content_hash=block_hash(block_type, page_number, text),
        parent_sequence_number=None,
        local_id=f"raw-{page_number}-{sequence}",
    )


def make_document(blocks: list[ParsedBlock], *, pages: int = 1) -> NormalizedDocument:
    parsed_pages: list[ParsedPage] = []
    for page_number in range(1, pages + 1):
        page_blocks = [block for block in blocks if block.page_number == page_number]
        source = "\n\n".join(block.text for block in page_blocks)
        parsed_pages.append(
            ParsedPage(
                page_number=page_number,
                width=595,
                height=842,
                text=source,
                word_count=len(source.split()),
                blocks=page_blocks,
            )
        )
    return NormalizedDocument(
        metadata={"title": "Tài liệu thử nghiệm"},
        page_count=pages,
        outline=[],
        pages=parsed_pages,
    )


def test_language_detection_preserves_vietnamese_unicode() -> None:
    detection = detect_language(
        "Đây là tài liệu tiếng Việt và các chương được trình bày rõ ràng."
    )

    assert detection.code == "vi"
    assert detection.confidence >= 0.8
    normalized = normalize_vietnamese_display("Tài  liệu , vẫn giữ dấu tiếng Việt.")
    assert normalized.text == "Tài liệu, vẫn giữ dấu tiếng Việt."
    assert [item["rule"] for item in normalized.transformations] == [
        "space_before_punctuation",
        "repeated_horizontal_space",
    ]


def test_normalizer_joins_safe_line_breaks_but_preserves_names_and_semantic_hyphens() -> None:
    normalized = normalize_vietnamese_display(
        "docu-\nment end-to-end\nđược giữ nguyên ."
    )
    ambiguous_name = normalize_vietnamese_display("Nexa-\nRead")

    assert normalized.text == "document end-to-end được giữ nguyên."
    assert "line_break_dehyphenation" in {
        item["rule"] for item in normalized.transformations
    }
    assert ambiguous_name.text == "Nexa- Read"
    assert ambiguous_name.needs_review is True
    assert ambiguous_name.confidence <= 0.68


def test_vietnamese_semantic_detectors_cover_required_prefixes() -> None:
    heading = make_block(1, "Chương 2. Kiến trúc hệ thống")
    list_item = make_block(2, "a) Bảo toàn trích dẫn")
    caption = make_block(3, "Hình 4. Luồng xử lý tài liệu")

    assert detect_heading(heading).level == 1
    assert detect_list_item(list_item).is_list_item is True
    assert detect_list_item(list_item).indent_level == 1
    assert detect_caption(caption).is_caption is True


@pytest.mark.parametrize(
    ("text", "level"),
    [
        ("Chương 1. Nhập môn", 1),
        ("Phần II. Nền tảng", 1),
        ("Phụ lục A. Thuật ngữ", 1),
        ("Mục 2. Phạm vi", 2),
        ("Bài 3. Thực hành", 2),
        ("Điều 4. Trách nhiệm", 2),
        ("Tiểu mục 2.1. Chi tiết", 3),
        ("Khoản 2. Điều kiện", 3),
    ],
)
def test_all_required_vietnamese_heading_prefixes(text: str, level: int) -> None:
    detection = detect_heading(make_block(1, text))

    assert detection.is_heading is True
    assert detection.level == level
    assert detection.confidence >= 0.9


@pytest.mark.parametrize("marker", ["1.", "1)", "a)", "a.", "-", "•"])
def test_all_required_list_markers(marker: str) -> None:
    detection = detect_list_item(make_block(1, f"{marker} Nội dung danh sách"))

    assert detection.is_list_item is True
    assert detection.marker == marker


@pytest.mark.parametrize(
    "text",
    [
        "Hình 1. Kiến trúc",
        "Biểu đồ 2. Độ chính xác",
        "Sơ đồ 3. Luồng dữ liệu",
        "Bảng 4. Kết quả",
    ],
)
def test_all_required_caption_prefixes(text: str) -> None:
    detection = detect_caption(make_block(1, text))

    assert detection.is_caption is True
    assert detection.confidence >= 0.9


def test_footnote_and_reference_detection_requires_evidence() -> None:
    page = ParsedPage(
        page_number=1,
        width=595,
        height=842,
        text="",
        word_count=0,
        blocks=[],
    )
    footnote = make_block(
        1,
        "1 Nội dung chú thích cuối trang.",
        bbox=[72, 700, 500, 790],
        font_size=8,
    )
    ambiguous = make_block(2, "2 Nội dung thân bài.", bbox=[72, 200, 500, 240])
    reference_heading = make_block(3, "Tài liệu tham khảo")
    reference = make_block(4, "[1] Nguyễn Văn A. Nghiên cứu nguồn.")

    assert detect_footnote(footnote, page).semantic_role == "footnote"
    ambiguous_result = detect_footnote(ambiguous, page)
    assert ambiguous_result.semantic_role is None
    assert ambiguous_result.confidence < 0.7
    assert detect_footnote(reference_heading, page).semantic_role == "reference_heading"
    assert detect_footnote(reference, page).semantic_role == "reference"


def test_abbreviations_and_proper_names_are_not_joined_without_confidence() -> None:
    abbreviation = normalize_vietnamese_display("TP.\nHCM và AI-\nML")
    proper_name = normalize_vietnamese_display("Nguyễn-\nAn")

    assert abbreviation.text == "TP. HCM và AI- ML"
    assert proper_name.text == "Nguyễn- An"
    assert abbreviation.needs_review is True
    assert proper_name.needs_review is True


def test_pipeline_keeps_source_text_and_adds_display_audit_and_semantics() -> None:
    blocks = [
        make_block(1, "Chương 1. Nền tảng"),
        make_block(2, "Tài  liệu\nđược trình bày rõ ràng ."),
        make_block(3, "1) Bảo toàn nội dung"),
        make_block(4, "Bảng 1. Chỉ số chất lượng"),
    ]
    normalized = normalize_document_layout(make_document(blocks), "pdf")

    assert normalized.blocks[0].text == blocks[0].text
    assert normalized.blocks[0].block_type == BlockType.HEADING_1
    assert normalized.blocks[0].metadata["keep_with_next"] is True
    assert normalized.blocks[1].text == blocks[1].text
    assert normalized.blocks[1].display_text == "Tài liệu được trình bày rõ ràng."
    assert normalized.blocks[1].transformation_log
    assert normalized.blocks[1].source_anchor["parser_block_ids"] == ["raw-1-2"]
    assert normalized.blocks[2].block_type == BlockType.LIST_ITEM
    assert normalized.blocks[2].metadata["avoid_break_inside"] is True
    assert normalized.blocks[3].metadata["semantic_role"] == "caption"
    assert normalized.metadata["language"] == "vi"
    assert normalized.metadata["layout_pipeline_version"] == LAYOUT_PIPELINE_VERSION
    assert normalized.metadata["layout_quality"] in {"HIGH", "MEDIUM"}


def test_pipeline_suppresses_only_repeated_page_margins() -> None:
    blocks: list[ParsedBlock] = []
    sequence = 0
    for page_number in range(1, 4):
        sequence += 1
        blocks.append(
            make_block(
                sequence,
                "NexaRead — Tài liệu nội bộ",
                page_number=page_number,
                bbox=[72, 20, 500, 40],
            )
        )
        sequence += 1
        blocks.append(
            make_block(
                sequence,
                f"Nội dung riêng của trang {page_number}.",
                page_number=page_number,
                bbox=[72, 160, 500, 220],
            )
        )

    normalized = normalize_document_layout(make_document(blocks, pages=3), "pdf")
    headers = [block for block in normalized.blocks if block.text.startswith("NexaRead")]
    bodies = [block for block in normalized.blocks if block.text.startswith("Nội dung")]

    assert all(block.metadata["suppressed"] is True for block in headers)
    assert all(block.metadata.get("suppressed") is not True for block in bodies)
    assert all(block.text == "NexaRead — Tài liệu nội bộ" for block in headers)


def test_pipeline_is_deterministic_when_applied_repeatedly() -> None:
    source = make_document(
        [
            make_block(1, "Phần 1. Quy tắc"),
            make_block(2, "Nội  dung , có định dạng."),
        ]
    )

    first = normalize_document_layout(source, "pdf")
    second = normalize_document_layout(first, "pdf")

    assert second == first


def test_document_type_detection_is_exposed_without_changing_source() -> None:
    source = make_document(
        [
            make_block(1, "Abstract"),
            make_block(2, "Methodology and results"),
            make_block(3, "References"),
        ]
    )

    normalized = normalize_document_layout(source, "pdf")

    assert normalized.metadata["document_type"] == "RESEARCH_PAPER"
    assert normalized.metadata["layout_type"] == "PAPER"
    assert [block.text for block in normalized.blocks] == [
        block.text for block in source.blocks
    ]

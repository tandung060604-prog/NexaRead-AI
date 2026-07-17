from __future__ import annotations

import hashlib
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from enum import StrEnum
from statistics import median
from typing import Any

import pymupdf


class BlockType(StrEnum):
    HEADING_1 = "HEADING_1"
    HEADING_2 = "HEADING_2"
    HEADING_3 = "HEADING_3"
    PARAGRAPH = "PARAGRAPH"
    LIST_ITEM = "LIST_ITEM"
    CODE = "CODE"
    QUOTE = "QUOTE"
    PAGE_BREAK = "PAGE_BREAK"


class PdfParseError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__("PDF extraction failed")
        self.code = code


class PdfNeedsOcrError(PdfParseError):
    def __init__(self) -> None:
        super().__init__("OCR_REQUIRED")


@dataclass(frozen=True)
class ParsedBlock:
    sequence_number: int
    block_type: BlockType
    text: str
    page_number: int
    chapter_index: int | None
    section_index: int | None
    paragraph_index: int | None
    start_offset: int
    end_offset: int
    bounding_box: list[float]
    font_name: str | None
    font_size: float | None
    is_bold: bool
    is_italic: bool
    confidence: float
    metadata: dict[str, object]
    content_hash: str
    parent_sequence_number: int | None


@dataclass(frozen=True)
class ParsedPage:
    page_number: int
    width: float
    height: float
    text: str
    word_count: int
    blocks: list[ParsedBlock]


@dataclass(frozen=True)
class ParsedPdf:
    metadata: dict[str, object]
    page_count: int
    outline: list[dict[str, object]]
    pages: list[ParsedPage]

    @property
    def blocks(self) -> list[ParsedBlock]:
        return [block for page in self.pages for block in page.blocks]


@dataclass
class _RawBlock:
    page_number: int
    page_width: float
    page_height: float
    parser_index: int
    text: str
    bbox: list[float]
    font_name: str | None
    font_size: float
    is_bold: bool
    is_italic: bool
    line_count: int
    metadata: dict[str, object] = field(default_factory=dict)


_HEADING_NUMBER = re.compile(r"^(?:chapter\s+\d+|\d+(?:\.\d+){0,2})\s+\S", re.IGNORECASE)
_LIST_PREFIX = re.compile(r"^(?:[\u2022*\-]|\d+[.)])\s+")
_CODE_PREFIX = re.compile(r"^(?:def |class |function |const |let |var |import |from |SELECT\s)")


def normalize_text(value: str) -> str:
    value = value.replace("\u00a0", " ")
    value = re.sub(r"[\t\r\f\v ]+", " ", value)
    value = re.sub(r"\s*\n\s*", " ", value)
    return value.strip()


def _join_lines(lines: list[str]) -> str:
    output = ""
    for line in lines:
        normalized = normalize_text(line)
        if not normalized:
            continue
        if output.endswith("-") and normalized[:1].islower():
            output = f"{output[:-1]}{normalized}"
        else:
            output = f"{output} {normalized}".strip()
    return normalize_text(output)


def _safe_metadata(metadata: dict[str, Any]) -> dict[str, object]:
    safe: dict[str, object] = {}
    for key, value in metadata.items():
        if value is not None and str(value).strip():
            safe[str(key)[:100]] = str(value)[:2000]
    return safe


def _extract_raw_blocks(page: pymupdf.Page, page_number: int) -> list[_RawBlock]:
    page_dict: dict[str, Any] = page.get_text("dict", sort=False)  # type: ignore[no-untyped-call]
    output: list[_RawBlock] = []
    for parser_index, block in enumerate(page_dict.get("blocks", [])):
        if block.get("type") != 0 or not block.get("lines"):
            continue
        line_texts: list[str] = []
        weighted_spans: list[tuple[int, str, float, int]] = []
        for line in block["lines"]:
            spans = line.get("spans", [])
            line_text = "".join(str(span.get("text", "")) for span in spans)
            if normalize_text(line_text):
                line_texts.append(line_text)
            for span in spans:
                text = normalize_text(str(span.get("text", "")))
                if text:
                    weighted_spans.append(
                        (
                            len(text),
                            str(span.get("font", "")),
                            float(span.get("size", 0.0)),
                            int(span.get("flags", 0)),
                        )
                    )
        text = _join_lines(line_texts)
        if not text or not weighted_spans:
            continue
        dominant = max(weighted_spans, key=lambda item: item[0])
        total_weight = sum(item[0] for item in weighted_spans)
        bold_weight = sum(
            item[0]
            for item in weighted_spans
            if item[3] & pymupdf.TEXT_FONT_BOLD or "bold" in item[1].lower()
        )
        italic_weight = sum(
            item[0]
            for item in weighted_spans
            if item[3] & pymupdf.TEXT_FONT_ITALIC
            or any(marker in item[1].lower() for marker in ("italic", "oblique"))
        )
        bbox = [round(float(value), 3) for value in block.get("bbox", (0, 0, 0, 0))]
        output.append(
            _RawBlock(
                page_number=page_number,
                page_width=float(page.rect.width),
                page_height=float(page.rect.height),
                parser_index=parser_index,
                text=text,
                bbox=bbox,
                font_name=dominant[1] or None,
                font_size=dominant[2],
                is_bold=bold_weight >= total_weight / 2,
                is_italic=italic_weight >= total_weight / 2,
                line_count=len(line_texts),
            )
        )
    return output


def _mark_repeated_margins(pages: list[list[_RawBlock]]) -> None:
    if len(pages) < 2:
        return
    page_hits: Counter[tuple[str, str]] = Counter()
    for blocks in pages:
        seen: set[tuple[str, str]] = set()
        for block in blocks:
            region: str | None = None
            if block.bbox[1] <= block.page_height * 0.12:
                region = "header"
            elif block.bbox[3] >= block.page_height * 0.88:
                region = "footer"
            if region:
                seen.add((region, block.text.casefold()))
        page_hits.update(seen)

    threshold = max(2, math.ceil(len(pages) * 0.6))
    repeated = {key for key, count in page_hits.items() if count >= threshold}
    for blocks in pages:
        for block in blocks:
            region = "header" if block.bbox[1] <= block.page_height * 0.12 else "footer"
            if (region, block.text.casefold()) in repeated:
                block.metadata.update({"suppressed": True, "repeated_margin": region})


def _order_page_blocks(blocks: list[_RawBlock]) -> list[_RawBlock]:
    if len(blocks) < 4:
        return blocks
    page_width = blocks[0].page_width
    narrow = [block for block in blocks if block.bbox[2] - block.bbox[0] < page_width * 0.68]
    left = [block for block in narrow if (block.bbox[0] + block.bbox[2]) / 2 < page_width * 0.46]
    right = [block for block in narrow if (block.bbox[0] + block.bbox[2]) / 2 > page_width * 0.54]
    if len(left) < 2 or len(right) < 2:
        return blocks
    if max(block.bbox[2] for block in left) > min(block.bbox[0] for block in right) + 4:
        return blocks

    column_top = min(block.bbox[1] for block in left + right)
    column_bottom = max(block.bbox[3] for block in left + right)
    wide = [block for block in blocks if block not in narrow]
    top_wide = sorted(
        (block for block in wide if block.bbox[3] <= column_top),
        key=lambda block: block.bbox[1],
    )
    bottom_wide = sorted(
        (block for block in wide if block.bbox[1] >= column_bottom), key=lambda b: b.bbox[1]
    )
    middle_wide = [block for block in wide if block not in top_wide and block not in bottom_wide]
    if middle_wide:
        return blocks
    ordered = top_wide + sorted(left, key=lambda b: (b.bbox[1], b.bbox[0]))
    ordered += sorted(right, key=lambda b: (b.bbox[1], b.bbox[0])) + bottom_wide
    for block in ordered:
        block.metadata.update({"reading_order": "two_column", "layout_confidence": 0.85})
    return ordered


def heading_type(
    block: _RawBlock, body_font_size: float, previous_block: _RawBlock | None
) -> tuple[BlockType | None, float]:
    if block.metadata.get("suppressed"):
        return None, 1.0
    ratio = block.font_size / body_font_size if body_font_size else 1.0
    score = 0.0
    if ratio >= 1.55:
        score += 2.5
    elif ratio >= 1.22:
        score += 1.5
    if block.is_bold:
        score += 1.0
    if len(block.text) <= 90 and block.line_count <= 2:
        score += 0.75
    if len(block.text) <= 45:
        score += 0.5
    if _HEADING_NUMBER.match(block.text):
        score += 1.25
    if block.bbox[1] <= block.page_height * 0.25:
        score += 0.35
    if previous_block is not None:
        gap = block.bbox[1] - previous_block.bbox[3]
        if gap >= body_font_size * 1.5:
            score += 0.5
    if block.text.endswith((".", ",", ";", ":")) and not _HEADING_NUMBER.match(block.text):
        score -= 0.75
    if score < 3.0:
        return None, min(0.95, 0.5 + score / 10)

    if ratio >= 1.65 or re.match(r"^chapter\s+\d+", block.text, re.IGNORECASE):
        return BlockType.HEADING_1, min(0.98, 0.65 + score / 10)
    if ratio >= 1.35 or re.match(r"^\d+\s+", block.text):
        return BlockType.HEADING_2, min(0.96, 0.62 + score / 10)
    return BlockType.HEADING_3, min(0.93, 0.58 + score / 10)


def _fallback_block_type(block: _RawBlock) -> tuple[BlockType, float]:
    if _LIST_PREFIX.match(block.text):
        return BlockType.LIST_ITEM, 0.88
    font_name = (block.font_name or "").lower()
    if "courier" in font_name or "mono" in font_name or _CODE_PREFIX.match(block.text):
        return BlockType.CODE, 0.82
    if block.text.startswith((">", "\u201c")):
        return BlockType.QUOTE, 0.78
    return BlockType.PARAGRAPH, 0.9


def _content_hash(block_type: BlockType, page_number: int, text: str) -> str:
    value = f"{block_type.value}\0{page_number}\0{text}".encode()
    return hashlib.sha256(value).hexdigest()


def parse_pdf(pdf_bytes: bytes, minimum_text_characters: int = 20) -> ParsedPdf:
    try:
        document = pymupdf.open(  # type: ignore[no-untyped-call]
            stream=pdf_bytes, filetype="pdf"
        )
    except Exception as exc:
        raise PdfParseError("PDF_DAMAGED") from exc

    try:
        if document.needs_pass:
            raise PdfParseError("PDF_PASSWORD_PROTECTED")
        if document.page_count == 0:
            raise PdfParseError("PDF_EMPTY")

        raw_pages = [
            _extract_raw_blocks(
                document.load_page(index),  # type: ignore[no-untyped-call]
                index + 1,
            )
            for index in range(document.page_count)
        ]
        _mark_repeated_margins(raw_pages)
        total_text = sum(
            len(block.text)
            for blocks in raw_pages
            for block in blocks
            if not block.metadata.get("suppressed")
        )
        if total_text < minimum_text_characters:
            raise PdfNeedsOcrError()

        ordered_pages = [_order_page_blocks(blocks) for blocks in raw_pages]
        body_sizes = [
            block.font_size
            for blocks in ordered_pages
            for block in blocks
            if not block.metadata.get("suppressed") and block.font_size > 0
        ]
        body_font_size = float(median(body_sizes)) if body_sizes else 11.0

        sequence = 0
        cursor = 0
        chapter_index = 0
        section_index = 0
        paragraph_index = 0
        heading_stack: dict[int, int] = {}
        parsed_pages: list[ParsedPage] = []
        for page_index, raw_blocks in enumerate(ordered_pages):
            page_number = page_index + 1
            parsed_blocks: list[ParsedBlock] = []
            visible_text: list[str] = []
            previous: _RawBlock | None = None
            for raw in raw_blocks:
                heading, confidence = heading_type(raw, body_font_size, previous)
                block_type, fallback_confidence = _fallback_block_type(raw)
                if heading is not None:
                    block_type = heading
                else:
                    confidence = fallback_confidence

                if block_type == BlockType.HEADING_1:
                    chapter_index += 1
                    section_index = 0
                    paragraph_index = 0
                    parent_sequence = None
                elif block_type == BlockType.HEADING_2:
                    section_index += 1
                    paragraph_index = 0
                    parent_sequence = heading_stack.get(1)
                elif block_type == BlockType.HEADING_3:
                    paragraph_index = 0
                    parent_sequence = heading_stack.get(2) or heading_stack.get(1)
                else:
                    paragraph_index += 1
                    parent_sequence = (
                        heading_stack.get(3) or heading_stack.get(2) or heading_stack.get(1)
                    )

                sequence += 1
                start_offset = cursor
                end_offset = start_offset + len(raw.text)
                parsed = ParsedBlock(
                    sequence_number=sequence,
                    block_type=block_type,
                    text=raw.text,
                    page_number=page_number,
                    chapter_index=chapter_index or None,
                    section_index=section_index or None,
                    paragraph_index=paragraph_index or None,
                    start_offset=start_offset,
                    end_offset=end_offset,
                    bounding_box=raw.bbox,
                    font_name=raw.font_name,
                    font_size=raw.font_size,
                    is_bold=raw.is_bold,
                    is_italic=raw.is_italic,
                    confidence=confidence,
                    metadata={**raw.metadata, "parser_index": raw.parser_index},
                    content_hash=_content_hash(block_type, page_number, raw.text),
                    parent_sequence_number=parent_sequence,
                )
                parsed_blocks.append(parsed)
                cursor = end_offset + 2
                if not raw.metadata.get("suppressed"):
                    visible_text.append(raw.text)
                if block_type in {
                    BlockType.HEADING_1,
                    BlockType.HEADING_2,
                    BlockType.HEADING_3,
                }:
                    level = int(block_type.value[-1])
                    heading_stack[level] = sequence
                    for deeper_level in range(level + 1, 4):
                        heading_stack.pop(deeper_level, None)
                previous = raw

            if page_index < document.page_count - 1:
                sequence += 1
                parsed_blocks.append(
                    ParsedBlock(
                        sequence_number=sequence,
                        block_type=BlockType.PAGE_BREAK,
                        text="",
                        page_number=page_number,
                        chapter_index=chapter_index or None,
                        section_index=section_index or None,
                        paragraph_index=None,
                        start_offset=cursor,
                        end_offset=cursor,
                        bounding_box=[0.0, 0.0, 0.0, 0.0],
                        font_name=None,
                        font_size=None,
                        is_bold=False,
                        is_italic=False,
                        confidence=1.0,
                        metadata={"synthetic": True},
                        content_hash=_content_hash(BlockType.PAGE_BREAK, page_number, ""),
                        parent_sequence_number=None,
                    )
                )

            page = document.load_page(page_index)  # type: ignore[no-untyped-call]
            page_text = "\n\n".join(visible_text)
            parsed_pages.append(
                ParsedPage(
                    page_number=page_number,
                    width=float(page.rect.width),
                    height=float(page.rect.height),
                    text=page_text,
                    word_count=len(page_text.split()),
                    blocks=parsed_blocks,
                )
            )

        outline: list[dict[str, object]] = []
        for item in document.get_toc(simple=True):
            if len(item) >= 3 and int(item[0]) in {1, 2, 3} and int(item[2]) > 0:
                title = normalize_text(str(item[1]))
                if title:
                    outline.append(
                        {"level": int(item[0]), "title": title[:500], "page_number": int(item[2])}
                    )
        return ParsedPdf(
            metadata=_safe_metadata(document.metadata or {}),
            page_count=document.page_count,
            outline=outline,
            pages=parsed_pages,
        )
    except PdfParseError:
        raise
    except Exception as exc:
        raise PdfParseError("PDF_PARSE_FAILED") from exc
    finally:
        document.close()  # type: ignore[no-untyped-call]

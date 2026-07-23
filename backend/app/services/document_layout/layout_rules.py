from __future__ import annotations

import math
from collections import Counter
from dataclasses import replace

from app.services.normalized_document import BlockType, NormalizedDocument, ParsedBlock, ParsedPage

DOCUMENT_TYPES = {
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


def detect_document_type(document: NormalizedDocument, source_type: str) -> tuple[str, float]:
    text = " ".join(block.text.casefold() for block in document.blocks[:160])
    title = str(document.metadata.get("title", "")).casefold()
    sample = f"{title} {text}"
    if source_type == "url":
        return "WEB_ARTICLE", 1.0
    if any(marker in sample for marker in ("luận văn", "luận án", "thesis", "dissertation")):
        return "THESIS", 0.96
    if any(marker in sample for marker in ("abstract", "methodology", "doi:", "references")):
        return "RESEARCH_PAPER", 0.93
    if any(marker in sample for marker in ("điều 1", "khoản 1", "nghị định", "thông tư")):
        return "LEGAL", 0.92
    if any(marker in sample for marker in ("giáo trình", "bài tập", "learning objectives")):
        return "TEXTBOOK", 0.9
    if any(marker in sample for marker in ("bài giảng", "lecture", "slide")):
        return "LECTURE", 0.88
    code_blocks = sum(block.block_type == BlockType.CODE for block in document.blocks)
    if code_blocks >= 2 or any(
        marker in sample for marker in ("api reference", "installation", "usage", "cài đặt")
    ):
        return "TECHNICAL", 0.9
    if any(marker in sample for marker in ("báo cáo", "executive summary", "report")):
        return "REPORT", 0.86
    if source_type == "epub" or (
        len(document.outline) >= 5 and document.page_count >= 10
    ):
        return "BOOK", 0.92
    return "OTHER", 0.7


def layout_type_for(document_type: str) -> str:
    if document_type in {"BOOK", "TEXTBOOK"}:
        return "BOOK"
    if document_type in {"RESEARCH_PAPER", "THESIS"}:
        return "PAPER"
    if document_type == "TECHNICAL":
        return "TECHNICAL_DOCUMENTATION"
    if document_type == "WEB_ARTICLE":
        return "BLOG_ARTICLE"
    return "GENERAL_DOCUMENT"


def suppress_repeated_margins(document: NormalizedDocument) -> NormalizedDocument:
    if len(document.pages) < 2:
        return document
    hits: Counter[tuple[str, str]] = Counter()
    candidates: dict[tuple[int, int], tuple[str, str]] = {}
    for page in document.pages:
        seen: set[tuple[str, str]] = set()
        for index, block in enumerate(page.blocks):
            if len(block.bounding_box) != 4 or page.height <= 0:
                continue
            region: str | None = None
            if block.bounding_box[1] <= page.height * 0.12:
                region = "header"
            elif block.bounding_box[3] >= page.height * 0.88:
                region = "footer"
            if region:
                key = (region, " ".join(block.text.casefold().split()))
                seen.add(key)
                candidates[(page.page_number, index)] = key
        hits.update(seen)
    threshold = max(2, math.ceil(len(document.pages) * 0.6))
    repeated = {key for key, count in hits.items() if count >= threshold}
    if not repeated:
        return document

    pages: list[ParsedPage] = []
    for page in document.pages:
        blocks: list[ParsedBlock] = []
        for index, block in enumerate(page.blocks):
            candidate_key = candidates.get((page.page_number, index))
            if candidate_key not in repeated:
                blocks.append(block)
                continue
            assert candidate_key is not None
            metadata = {
                **block.metadata,
                "suppressed": True,
                "repeated_margin": candidate_key[0],
                "semantic_role": "repeated_margin",
            }
            blocks.append(replace(block, metadata=metadata))
        pages.append(replace(page, blocks=blocks))
    return replace(document, pages=pages)


def annotate_reading_order(document: NormalizedDocument) -> NormalizedDocument:
    pages: list[ParsedPage] = []
    for page in document.pages:
        blocks: list[ParsedBlock] = []
        for block in page.blocks:
            existing = block.metadata.get("reading_order")
            if existing:
                raw_confidence = block.metadata.get(
                    "reading_order_confidence",
                    block.metadata.get("layout_confidence", 0.85),
                )
                confidence = (
                    float(raw_confidence)
                    if isinstance(raw_confidence, (int, float))
                    else 0.85
                )
                order = str(existing)
            elif len(block.bounding_box) == 4:
                confidence = 0.78
                order = "geometry_single_column"
            else:
                confidence = 0.7
                order = "source_order"
            blocks.append(
                replace(
                    block,
                    metadata={
                        **block.metadata,
                        "reading_order": order,
                        "reading_order_confidence": max(0.0, min(1.0, confidence)),
                    },
                )
            )
        pages.append(replace(page, blocks=blocks))
    return replace(document, pages=pages)

from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.normalized_document import ParsedBlock, ParsedPage

_FOOTNOTE = re.compile(r"^\s*(?P<marker>(?:\d{1,3}|[*†‡]))[.)]?\s+\S")
_REFERENCE_HEADING = re.compile(
    r"^\s*(?:tài\s+liệu\s+tham\s+khảo|tham\s+khảo|references|bibliography)\s*$",
    re.IGNORECASE,
)
_REFERENCE_ENTRY = re.compile(r"^\s*(?:\[\d+]|(?:\d{1,3})[.)])\s+\S")


@dataclass(frozen=True)
class FootnoteDetection:
    semantic_role: str | None
    reference: str | None
    confidence: float


def detect_footnote(block: ParsedBlock, page: ParsedPage) -> FootnoteDetection:
    if _REFERENCE_HEADING.match(block.text):
        return FootnoteDetection("reference_heading", None, 0.98)
    if _REFERENCE_ENTRY.match(block.text) and block.page_number >= max(1, page.page_number):
        return FootnoteDetection("reference", None, 0.82)

    match = _FOOTNOTE.match(block.text)
    if not match:
        return FootnoteDetection(None, None, 1.0)
    near_bottom = (
        len(block.bounding_box) == 4
        and page.height > 0
        and block.bounding_box[3] >= page.height * 0.72
    )
    small_font = block.font_size is not None and block.font_size <= 9.5
    if near_bottom or small_font:
        return FootnoteDetection("footnote", match.group("marker"), 0.9)
    return FootnoteDetection(None, match.group("marker"), 0.55)

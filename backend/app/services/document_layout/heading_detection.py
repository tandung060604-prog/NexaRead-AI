from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.normalized_document import BlockType, ParsedBlock

_VIETNAMESE_HEADING = re.compile(
    r"^\s*(?P<prefix>chương|phần|mục|tiểu\s+mục|bài|điều|khoản|phụ\s+lục)"
    r"(?:\s+(?P<number>[IVXLCDM]+|[A-ZÀ-Ỹ]|\d+(?:[.\-]\d+)*))?"
    r"(?:[.:\-)]|\s)+\S",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class HeadingDetection:
    is_heading: bool
    level: int | None
    confidence: float
    rule: str | None


def detect_heading(block: ParsedBlock) -> HeadingDetection:
    if block.block_type in {
        BlockType.HEADING_1,
        BlockType.HEADING_2,
        BlockType.HEADING_3,
    }:
        return HeadingDetection(
            True,
            int(block.block_type.value[-1]),
            max(0.8, block.confidence),
            "parser_heading",
        )

    match = _VIETNAMESE_HEADING.match(block.text)
    if not match:
        return HeadingDetection(False, None, 1.0, None)
    prefix = " ".join(match.group("prefix").casefold().split())
    if prefix in {"chương", "phần", "phụ lục"}:
        level = 1
    elif prefix in {"mục", "bài", "điều"}:
        level = 2
    else:
        level = 3
    return HeadingDetection(True, level, 0.96, "vi_heading_prefix")

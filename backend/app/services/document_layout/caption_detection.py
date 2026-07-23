from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.normalized_document import ParsedBlock

_CAPTION = re.compile(
    r"^\s*(?P<prefix>hình|biểu\s+đồ|sơ\s+đồ|bảng)"
    r"(?:\s+(?P<number>[A-ZÀ-Ỹ]|\d+(?:[.\-]\d+)*))?(?:[.:\-)]|\s)+\S",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class CaptionDetection:
    is_caption: bool
    confidence: float
    label: str | None


def detect_caption(block: ParsedBlock) -> CaptionDetection:
    match = _CAPTION.match(block.text)
    if not match:
        return CaptionDetection(False, 1.0, None)
    label = " ".join(
        part for part in (match.group("prefix"), match.group("number")) if part
    )
    return CaptionDetection(True, 0.96, label)

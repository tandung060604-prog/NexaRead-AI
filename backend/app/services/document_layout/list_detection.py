from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.normalized_document import BlockType, ParsedBlock

_LIST_MARKER = re.compile(
    r"^\s*(?P<marker>(?:\d+|[A-Za-zÀ-ỹ])[.)]|[-•])\s+\S",
    re.UNICODE,
)


@dataclass(frozen=True)
class ListDetection:
    is_list_item: bool
    indent_level: int
    confidence: float
    marker: str | None


def detect_list_item(block: ParsedBlock) -> ListDetection:
    match = _LIST_MARKER.match(block.text)
    if block.block_type == BlockType.LIST_ITEM:
        marker = match.group("marker") if match else None
        return ListDetection(True, _indent_level(block, marker), 0.98, marker)
    if not match:
        return ListDetection(False, 0, 1.0, None)
    marker = match.group("marker")
    return ListDetection(True, _indent_level(block, marker), 0.94, marker)


def _indent_level(block: ParsedBlock, marker: str | None) -> int:
    explicit = block.metadata.get("indent_level")
    if isinstance(explicit, int) and explicit >= 0:
        return explicit
    if marker and marker[0].isalpha():
        return 1
    return 0

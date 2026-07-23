from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from enum import StrEnum


class BlockType(StrEnum):
    HEADING_1 = "HEADING_1"
    HEADING_2 = "HEADING_2"
    HEADING_3 = "HEADING_3"
    PARAGRAPH = "PARAGRAPH"
    LIST_ITEM = "LIST_ITEM"
    CODE = "CODE"
    QUOTE = "QUOTE"
    PAGE_BREAK = "PAGE_BREAK"
    TABLE = "TABLE"
    FORMULA = "FORMULA"
    IMAGE = "IMAGE"


@dataclass(frozen=True)
class ParsedAsset:
    local_id: str
    asset_type: str
    content_type: str | None
    source_reference: str
    metadata: dict[str, object] = field(default_factory=dict)


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
    local_id: str | None = None
    display_text: str | None = None
    transformation_log: list[dict[str, object]] = field(default_factory=list)
    transformation_confidence: float = 1.0
    needs_review: bool = False
    source_anchor: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class ParsedPage:
    page_number: int
    width: float
    height: float
    text: str
    word_count: int
    blocks: list[ParsedBlock]


@dataclass(frozen=True)
class NormalizedDocument:
    metadata: dict[str, object]
    page_count: int
    outline: list[dict[str, object]]
    pages: list[ParsedPage]
    assets: list[ParsedAsset] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def blocks(self) -> list[ParsedBlock]:
        return [block for page in self.pages for block in page.blocks]


class DocumentParseError(RuntimeError):
    def __init__(self, code: str, message: str = "Document extraction failed") -> None:
        super().__init__(message)
        self.code = code


def block_hash(block_type: BlockType, page_number: int, text: str) -> str:
    value = f"{block_type.value}\0{page_number}\0{text}".encode()
    return hashlib.sha256(value).hexdigest()


def logical_page(page_number: int, blocks: list[ParsedBlock]) -> ParsedPage:
    text = "\n\n".join(block.text for block in blocks if block.text)
    return ParsedPage(
        page_number=page_number,
        width=0.0,
        height=0.0,
        text=text,
        word_count=len(text.split()),
        blocks=blocks,
    )

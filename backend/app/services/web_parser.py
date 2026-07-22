from __future__ import annotations

from urllib.parse import urljoin

import bleach  # type: ignore[import-untyped]
from bs4 import BeautifulSoup, Tag

from app.services.normalized_document import (
    BlockType,
    DocumentParseError,
    NormalizedDocument,
    ParsedAsset,
    ParsedBlock,
    block_hash,
    logical_page,
)

_ALLOWED_TAGS = [
    "article",
    "main",
    "section",
    "h1",
    "h2",
    "h3",
    "p",
    "ul",
    "ol",
    "li",
    "pre",
    "code",
    "blockquote",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "a",
    "img",
    "strong",
    "em",
]


def _main_container(soup: BeautifulSoup) -> Tag:
    candidates = [*soup.find_all("article"), *soup.find_all("main")]
    if soup.body is not None:
        candidates.append(soup.body)
    if not candidates:
        raise DocumentParseError("URL_CONTENT_EMPTY")
    return max(candidates, key=lambda node: len(node.get_text(" ", strip=True)))


def parse_web_page(data: bytes, source_url: str) -> NormalizedDocument:
    soup = BeautifulSoup(data, "html.parser")
    title = " ".join((soup.title.get_text(" ", strip=True) if soup.title else "").split())
    container = _main_container(soup)
    for unwanted in container.find_all(
        ["script", "style", "noscript", "iframe", "object", "embed", "svg", "form", "nav"]
    ):
        unwanted.decompose()
    sanitized = bleach.clean(
        str(container),
        tags=_ALLOWED_TAGS,
        attributes={"a": ["href"], "img": ["src", "alt"]},
        protocols=["http", "https"],
        strip=True,
        strip_comments=True,
    )
    clean = BeautifulSoup(sanitized, "html.parser")
    blocks: list[ParsedBlock] = []
    assets: list[ParsedAsset] = []
    outline: list[dict[str, object]] = []
    heading_stack: dict[int, int] = {}
    cursor = 0
    chapter_index = 0
    section_index = 0
    paragraph_index = 0

    mapping = {
        "h1": BlockType.HEADING_1,
        "h2": BlockType.HEADING_2,
        "h3": BlockType.HEADING_3,
        "p": BlockType.PARAGRAPH,
        "li": BlockType.LIST_ITEM,
        "pre": BlockType.CODE,
        "blockquote": BlockType.QUOTE,
        "table": BlockType.TABLE,
        "img": BlockType.IMAGE,
    }
    for tag in clean.find_all(list(mapping)):
        if tag.find_parent(["p", "li", "pre", "blockquote", "table"]):
            continue
        block_type = mapping[tag.name]
        if block_type == BlockType.IMAGE:
            source = urljoin(source_url, str(tag.get("src", "")))
            text = " ".join(str(tag.get("alt", "Image")).split()) or "Image"
            asset_id = f"asset-{len(assets) + 1}"
            assets.append(
                ParsedAsset(
                    local_id=asset_id,
                    asset_type="image",
                    content_type=None,
                    source_reference=source,
                )
            )
        else:
            source = ""
            asset_id = ""
            text = " ".join(tag.get_text(" ", strip=True).split())
        if not text:
            continue

        if block_type == BlockType.HEADING_1:
            chapter_index += 1
            section_index = 0
            paragraph_index = 0
            parent = None
            level = 1
        elif block_type == BlockType.HEADING_2:
            section_index += 1
            paragraph_index = 0
            parent = heading_stack.get(1)
            level = 2
        elif block_type == BlockType.HEADING_3:
            paragraph_index = 0
            parent = heading_stack.get(2) or heading_stack.get(1)
            level = 3
        else:
            paragraph_index += 1
            parent = heading_stack.get(3) or heading_stack.get(2) or heading_stack.get(1)
            level = 0
        sequence = len(blocks) + 1
        links = [
            urljoin(source_url, str(link.get("href"))) for link in tag.find_all("a", href=True)
        ]
        metadata: dict[str, object] = {
            "source_url": source_url,
            "source_order": sequence,
            "links": links,
        }
        if source:
            metadata.update({"source_reference": source, "asset_local_id": asset_id})
        block = ParsedBlock(
            sequence_number=sequence,
            block_type=block_type,
            text=text,
            page_number=1,
            chapter_index=chapter_index or None,
            section_index=section_index or None,
            paragraph_index=paragraph_index or None,
            start_offset=cursor,
            end_offset=cursor + len(text),
            bounding_box=[],
            font_name=None,
            font_size=None,
            is_bold=block_type.name.startswith("HEADING"),
            is_italic=False,
            confidence=1.0,
            metadata=metadata,
            content_hash=block_hash(block_type, 1, text),
            parent_sequence_number=parent,
            local_id=f"block-{sequence}",
        )
        blocks.append(block)
        cursor = block.end_offset + 2
        if level:
            heading_stack[level] = sequence
            for deeper in range(level + 1, 4):
                heading_stack.pop(deeper, None)
            outline.append({"level": level, "title": text[:500], "page_number": 1})

    if not blocks:
        raise DocumentParseError("URL_CONTENT_EMPTY")
    return NormalizedDocument(
        metadata={
            "title": title,
            "source_type": "url",
            "source_url": source_url,
            "page_count": 1,
            "sanitized": True,
        },
        page_count=1,
        outline=outline,
        pages=[logical_page(1, blocks)],
        assets=assets,
    )

from __future__ import annotations

from io import BytesIO
from zipfile import BadZipFile, ZipFile

from bs4 import BeautifulSoup, Tag
from ebooklib import ITEM_DOCUMENT, ITEM_IMAGE, epub  # type: ignore[import-untyped]

from app.services.normalized_document import (
    BlockType,
    DocumentParseError,
    NormalizedDocument,
    ParsedAsset,
    ParsedBlock,
    block_hash,
    logical_page,
)

_FONT_OBFUSCATION_ALGORITHMS = {
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
}


def _reject_drm(data: bytes) -> None:
    try:
        with ZipFile(BytesIO(data)) as archive:
            try:
                encryption = archive.read("META-INF/encryption.xml").decode("utf-8", "replace")
            except KeyError:
                return
    except BadZipFile as exc:
        raise DocumentParseError("EPUB_DAMAGED") from exc
    soup = BeautifulSoup(encryption, "xml")
    algorithms = {
        str(node.get("Algorithm", ""))
        for node in soup.find_all(lambda tag: tag.name and tag.name.endswith("EncryptionMethod"))
    }
    if any(algorithm and algorithm not in _FONT_OBFUSCATION_ALGORITHMS for algorithm in algorithms):
        raise DocumentParseError("EPUB_DRM_PROTECTED")


def _metadata_value(book: epub.EpubBook, name: str) -> str | None:
    values = book.get_metadata("DC", name)
    if not values:
        return None
    value = str(values[0][0]).strip()
    return value or None


def _tag_type(tag: Tag) -> BlockType | None:
    return {
        "h1": BlockType.HEADING_1,
        "h2": BlockType.HEADING_2,
        "h3": BlockType.HEADING_3,
        "p": BlockType.PARAGRAPH,
        "li": BlockType.LIST_ITEM,
        "pre": BlockType.CODE,
        "blockquote": BlockType.QUOTE,
        "table": BlockType.TABLE,
        "img": BlockType.IMAGE,
    }.get(tag.name.casefold())


def parse_epub(data: bytes) -> NormalizedDocument:
    _reject_drm(data)
    try:
        book = epub.read_epub(BytesIO(data), options={"ignore_ncx": False})
    except Exception as exc:
        raise DocumentParseError("EPUB_DAMAGED") from exc

    assets = [
        ParsedAsset(
            local_id=f"asset-{index}",
            asset_type="image",
            content_type=item.media_type,
            source_reference=item.file_name,
        )
        for index, item in enumerate(book.get_items_of_type(ITEM_IMAGE), start=1)
    ]
    asset_by_path = {asset.source_reference: asset.local_id for asset in assets}
    pages = []
    outline: list[dict[str, object]] = []
    warnings: list[str] = []
    sequence = 0
    cursor = 0
    chapter_index = 0
    heading_stack: dict[int, int] = {}

    spine_ids = [entry[0] if isinstance(entry, tuple) else str(entry) for entry in book.spine]
    for spine_id in spine_ids:
        item = book.get_item_with_id(spine_id)
        if item is None or item.get_type() != ITEM_DOCUMENT:
            continue
        if spine_id == "nav" or "nav" in getattr(item, "properties", []):
            continue
        soup = BeautifulSoup(item.get_content(), "html.parser")
        chapter_blocks: list[ParsedBlock] = []
        chapter_index += 1
        paragraph_index = 0
        section_index = 0
        for tag in soup.find_all(
            ["h1", "h2", "h3", "p", "li", "pre", "blockquote", "table", "img"]
        ):
            block_type = _tag_type(tag)
            if block_type is None:
                continue
            if tag.find_parent(["p", "li", "pre", "blockquote", "table"]):
                continue
            if block_type == BlockType.IMAGE:
                source = str(tag.get("src", "")).split("#", 1)[0]
                text = str(tag.get("alt", "Image")).strip() or "Image"
            else:
                source = ""
                text = " ".join(tag.get_text(" ", strip=True).split())
            if not text:
                continue

            if block_type == BlockType.HEADING_1:
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

            sequence += 1
            links = [str(link.get("href")) for link in tag.find_all("a", href=True)]
            metadata: dict[str, object] = {
                "spine_id": spine_id,
                "spine_index": chapter_index,
                "internal_links": [
                    link for link in links if not link.startswith(("http://", "https://"))
                ],
                "source_order": sequence,
            }
            if source:
                metadata["source_reference"] = source
                if source in asset_by_path:
                    metadata["asset_local_id"] = asset_by_path[source]
            block = ParsedBlock(
                sequence_number=sequence,
                block_type=block_type,
                text=text,
                page_number=chapter_index,
                chapter_index=chapter_index,
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
                content_hash=block_hash(block_type, chapter_index, text),
                parent_sequence_number=parent,
                local_id=f"block-{sequence}",
            )
            chapter_blocks.append(block)
            cursor = block.end_offset + 2
            if level:
                heading_stack[level] = sequence
                for deeper in range(level + 1, 4):
                    heading_stack.pop(deeper, None)
                outline.append({"level": level, "title": text[:500], "page_number": chapter_index})
        if chapter_blocks:
            pages.append(logical_page(chapter_index, chapter_blocks))
        else:
            warnings.append(f"Spine item {spine_id} contained no readable blocks")

    if not pages:
        raise DocumentParseError("EPUB_EMPTY")
    metadata = {
        key: value
        for key, value in {
            "title": _metadata_value(book, "title"),
            "author": _metadata_value(book, "creator"),
            "language": _metadata_value(book, "language"),
            "source_type": "epub",
            "page_count": len(pages),
        }.items()
        if value not in (None, "")
    }
    return NormalizedDocument(
        metadata=metadata,
        page_count=len(pages),
        outline=outline,
        pages=pages,
        assets=assets,
        warnings=warnings,
    )

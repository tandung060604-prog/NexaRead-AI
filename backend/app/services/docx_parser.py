from __future__ import annotations

from collections.abc import Iterator
from io import BytesIO

from docx import Document as OpenXmlDocument
from docx.document import Document as DocumentObject
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.services.normalized_document import (
    BlockType,
    DocumentParseError,
    NormalizedDocument,
    ParsedAsset,
    ParsedBlock,
    block_hash,
    logical_page,
)


def _iter_body(document: DocumentObject) -> Iterator[Paragraph | Table]:
    for child in document.element.body.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, document)
        elif child.tag.endswith("}tbl"):
            yield Table(child, document)


def _block_type(paragraph: Paragraph) -> BlockType:
    style = (paragraph.style.name if paragraph.style else "").casefold()
    if style.startswith("heading"):
        suffix = style.removeprefix("heading").strip()
        level = int(suffix) if suffix.isdigit() else 1
        return BlockType(f"HEADING_{min(level, 3)}")
    if "code" in style or any(
        run.font.name and "mono" in run.font.name.casefold() for run in paragraph.runs
    ):
        return BlockType.CODE
    if "list" in style:
        return BlockType.LIST_ITEM
    properties = paragraph._p.pPr  # noqa: SLF001 - python-docx exposes no public list API.
    if properties is not None and properties.numPr is not None:
        return BlockType.LIST_ITEM
    if "quote" in style:
        return BlockType.QUOTE
    return BlockType.PARAGRAPH


def parse_docx(data: bytes) -> NormalizedDocument:
    try:
        document = OpenXmlDocument(BytesIO(data))
    except Exception as exc:
        raise DocumentParseError("DOCX_DAMAGED") from exc

    blocks: list[ParsedBlock] = []
    assets: list[ParsedAsset] = []
    outline: list[dict[str, object]] = []
    heading_stack: dict[int, int] = {}
    cursor = 0
    chapter_index = 0
    section_index = 0
    paragraph_index = 0

    for item in _iter_body(document):
        if isinstance(item, Table):
            rows = [[" ".join(cell.text.split()) for cell in row.cells] for row in item.rows]
            text = "\n".join(" | ".join(cell for cell in row if cell) for row in rows).strip()
            if not text:
                continue
            block_type = BlockType.TABLE
            metadata: dict[str, object] = {"rows": rows, "source_order": len(blocks) + 1}
            is_bold = False
            is_italic = False
        else:
            text = " ".join(item.text.split())
            drawings = item._p.xpath(".//*[local-name()='drawing']")  # noqa: SLF001
            for drawing_index, _ in enumerate(drawings, start=1):
                local_id = f"image-{len(assets) + 1}"
                assets.append(
                    ParsedAsset(
                        local_id=local_id,
                        asset_type="image",
                        content_type=None,
                        source_reference=f"paragraph-{len(blocks) + 1}-drawing-{drawing_index}",
                    )
                )
            if not text and drawings:
                text = "Image"
                block_type = BlockType.IMAGE
            elif not text:
                continue
            else:
                block_type = _block_type(item)
            metadata = {
                "style": item.style.name if item.style else None,
                "source_order": len(blocks) + 1,
                "image_references": [asset.local_id for asset in assets[-len(drawings) :]]
                if drawings
                else [],
            }
            is_bold = any(run.bold is True for run in item.runs)
            is_italic = any(run.italic is True for run in item.runs)

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
            is_bold=is_bold,
            is_italic=is_italic,
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
        raise DocumentParseError("DOCX_EMPTY")

    properties = document.core_properties
    metadata_values = {
        "title": properties.title,
        "author": properties.author,
        "language": properties.language,
        "source_type": "docx",
        "page_count": 1,
    }
    metadata = {key: value for key, value in metadata_values.items() if value not in (None, "")}
    return NormalizedDocument(
        metadata=metadata,
        page_count=1,
        outline=outline,
        pages=[logical_page(1, blocks)],
        assets=assets,
    )

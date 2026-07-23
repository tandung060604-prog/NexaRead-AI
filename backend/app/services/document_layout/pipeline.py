from __future__ import annotations

from dataclasses import replace

from app.services.document_layout.ai_repair import (
    Clock,
    LayoutRepairProvider,
    apply_optional_ai_repair,
)
from app.services.document_layout.caption_detection import detect_caption
from app.services.document_layout.footnote_detection import detect_footnote
from app.services.document_layout.heading_detection import detect_heading
from app.services.document_layout.language import detect_language
from app.services.document_layout.layout_rules import (
    annotate_reading_order,
    detect_document_type,
    layout_type_for,
    suppress_repeated_margins,
)
from app.services.document_layout.list_detection import detect_list_item
from app.services.document_layout.paragraph_reconstruction import reconstruct_paragraph
from app.services.document_layout.quality import score_layout
from app.services.normalized_document import (
    BlockType,
    NormalizedDocument,
    ParsedBlock,
    ParsedPage,
    block_hash,
)

LAYOUT_PIPELINE_VERSION = "2026.07-v1"
_ATOMIC_TYPES = {
    BlockType.CODE,
    BlockType.FORMULA,
    BlockType.IMAGE,
    BlockType.TABLE,
}


def _source_anchor(block: ParsedBlock) -> dict[str, object]:
    parser_id = block.local_id or f"page-{block.page_number}-block-{block.sequence_number}"
    return {
        "page_number": block.page_number,
        "bounding_box": block.bounding_box,
        "parser_block_ids": [parser_id],
        "source_start_offset": block.start_offset,
        "source_end_offset": block.end_offset,
    }


def _semantic_block(
    block: ParsedBlock,
    page: ParsedPage,
    language: str,
    *,
    previous_asset_id: str | None,
    is_first_paragraph: bool,
) -> ParsedBlock:
    display = reconstruct_paragraph(block.text, language)
    heading = detect_heading(block)
    list_item = detect_list_item(block)
    caption = detect_caption(block)
    footnote = detect_footnote(block, page)

    block_type = block.block_type
    semantic_role = block_type.value.casefold()
    heading_level: int | None = None
    confidence = block.confidence
    if heading.is_heading and heading.level is not None:
        block_type = BlockType(f"HEADING_{heading.level}")
        semantic_role = "heading"
        heading_level = heading.level
        confidence = min(confidence, heading.confidence)
    elif list_item.is_list_item:
        block_type = BlockType.LIST_ITEM
        semantic_role = "list_item"
        confidence = min(confidence, list_item.confidence)
    elif caption.is_caption:
        semantic_role = "caption"
        confidence = min(confidence, caption.confidence)
    elif footnote.semantic_role:
        semantic_role = footnote.semantic_role
        confidence = min(confidence, footnote.confidence)
    elif block.metadata.get("suppressed") is True:
        semantic_role = "repeated_margin"

    keep_with_next = semantic_role in {"heading", "caption", "reference_heading"}
    avoid_break_inside = (
        block_type in _ATOMIC_TYPES
        or semantic_role in {"quote", "list_item", "footnote", "caption"}
    )
    metadata = {
        **block.metadata,
        "semantic_role": semantic_role,
        "heading_level": heading_level,
        "keep_with_next": keep_with_next,
        "avoid_break_inside": avoid_break_inside,
        "break_before": heading_level == 1,
        "break_after": False,
        "indent_level": list_item.indent_level if list_item.is_list_item else 0,
        "text_align": str(block.metadata.get("text_align", "left")),
        "is_first_paragraph": is_first_paragraph and semantic_role == "paragraph",
        "is_chapter_opening": heading_level == 1,
        "caption_for_asset_id": previous_asset_id if caption.is_caption else None,
        "footnote_reference": footnote.reference,
        "source_page_number": block.page_number,
        "semantic_detection_confidence": round(confidence, 4),
    }
    transformation_log = list(block.transformation_log)
    for item in display.transformations:
        if item not in transformation_log:
            transformation_log.append(item)
    return replace(
        block,
        block_type=block_type,
        display_text=display.text,
        transformation_log=transformation_log,
        transformation_confidence=min(
            block.transformation_confidence, display.confidence
        ),
        needs_review=block.needs_review or display.needs_review or confidence < 0.7,
        source_anchor={**_source_anchor(block), **block.source_anchor},
        metadata=metadata,
        confidence=confidence,
        content_hash=block_hash(block_type, block.page_number, block.text),
    )


def _apply_semantics(document: NormalizedDocument, language: str) -> NormalizedDocument:
    pages: list[ParsedPage] = []
    first_paragraph_pending = True
    for page in document.pages:
        blocks: list[ParsedBlock] = []
        previous_asset_id: str | None = None
        for block in page.blocks:
            is_paragraph = block.block_type == BlockType.PARAGRAPH
            normalized = _semantic_block(
                block,
                page,
                language,
                previous_asset_id=previous_asset_id,
                is_first_paragraph=is_paragraph and first_paragraph_pending,
            )
            if normalized.block_type.name.startswith("HEADING"):
                first_paragraph_pending = True
            elif normalized.block_type == BlockType.PARAGRAPH:
                first_paragraph_pending = False
            asset_id = normalized.metadata.get("asset_local_id")
            if normalized.block_type == BlockType.IMAGE and isinstance(asset_id, str):
                previous_asset_id = asset_id
            elif (
                not normalized.block_type.name.startswith("HEADING")
                and normalized.metadata.get("semantic_role") != "caption"
            ):
                previous_asset_id = None
            blocks.append(normalized)
        pages.append(replace(page, blocks=blocks))
    return replace(document, pages=pages)


def _rebuild_hierarchy(document: NormalizedDocument) -> NormalizedDocument:
    chapter_index = 0
    section_index = 0
    paragraph_index = 0
    heading_stack: dict[int, int] = {}
    pages: list[ParsedPage] = []
    outline = list(document.outline)
    generated_outline: list[dict[str, object]] = []
    for page in document.pages:
        blocks: list[ParsedBlock] = []
        for block in page.blocks:
            level = block.metadata.get("heading_level")
            if isinstance(level, int):
                if level == 1:
                    chapter_index += 1
                    section_index = 0
                elif level == 2:
                    section_index += 1
                paragraph_index = 0
                parent = heading_stack.get(level - 1)
                heading_stack[level] = block.sequence_number
                for deeper in range(level + 1, 4):
                    heading_stack.pop(deeper, None)
                generated_outline.append(
                    {
                        "level": level,
                        "title": (block.display_text or block.text)[:500],
                        "page_number": block.page_number,
                    }
                )
            elif block.block_type == BlockType.PAGE_BREAK:
                parent = None
            else:
                paragraph_index += 1
                parent = (
                    heading_stack.get(3)
                    or heading_stack.get(2)
                    or heading_stack.get(1)
                )
            blocks.append(
                replace(
                    block,
                    chapter_index=chapter_index or None,
                    section_index=section_index or None,
                    paragraph_index=(
                        paragraph_index
                        if not isinstance(level, int)
                        and block.block_type != BlockType.PAGE_BREAK
                        else None
                    ),
                    parent_sequence_number=parent,
                )
            )
        pages.append(replace(page, blocks=blocks))
    if not outline:
        outline = generated_outline
    return replace(document, pages=pages, outline=outline)


def normalize_document_layout(
    document: NormalizedDocument,
    source_type: str,
    *,
    document_type_override: str | None = None,
    ai_repair_enabled: bool = False,
    repair_provider: LayoutRepairProvider | None = None,
    ai_repair_confidence_threshold: float = 0.7,
    ai_repair_clock: Clock | None = None,
) -> NormalizedDocument:
    source_text = "\n".join(
        block.text
        for block in document.blocks
        if block.text and block.metadata.get("suppressed") is not True
    )
    language = detect_language(source_text)
    detected_document_type, document_type_confidence = detect_document_type(
        document, source_type
    )
    effective_document_type = document_type_override or detected_document_type
    normalized = suppress_repeated_margins(document)
    normalized = annotate_reading_order(normalized)
    normalized = _apply_semantics(normalized, language.code)
    if ai_repair_clock is None:
        normalized = apply_optional_ai_repair(
            normalized,
            enabled=ai_repair_enabled,
            provider=repair_provider,
            confidence_threshold=ai_repair_confidence_threshold,
        )
    else:
        normalized = apply_optional_ai_repair(
            normalized,
            enabled=ai_repair_enabled,
            provider=repair_provider,
            confidence_threshold=ai_repair_confidence_threshold,
            clock=ai_repair_clock,
        )
    normalized = _rebuild_hierarchy(normalized)
    quality = score_layout(normalized)
    warnings = list(dict.fromkeys([*normalized.warnings, *quality.warnings]))
    metadata = {
        **normalized.metadata,
        "language": language.code,
        "language_confidence": language.confidence,
        "document_type": detected_document_type,
        "effective_document_type": effective_document_type,
        "document_type_override": document_type_override,
        "document_type_confidence": document_type_confidence,
        "layout_type": layout_type_for(effective_document_type),
        "layout_pipeline_version": LAYOUT_PIPELINE_VERSION,
        "layout_quality_score": quality.score,
        "layout_quality": quality.label,
        "layout_warnings": quality.warnings,
        "layout_needs_review_count": quality.needs_review_count,
        "chapter_count": len(
            {
                block.chapter_index
                for block in normalized.blocks
                if block.chapter_index is not None
            }
        ),
    }
    return replace(
        normalized,
        metadata=metadata,
        warnings=warnings,
    )

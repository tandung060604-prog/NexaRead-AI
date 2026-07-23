from __future__ import annotations

from dataclasses import dataclass

from app.services.normalized_document import NormalizedDocument


@dataclass(frozen=True)
class LayoutQuality:
    score: float
    label: str
    warnings: list[str]
    needs_review_count: int


def _confidence(value: object, default: float) -> float:
    if isinstance(value, (int, float)):
        return max(0.0, min(1.0, float(value)))
    return default


def score_layout(document: NormalizedDocument) -> LayoutQuality:
    blocks = [
        block
        for block in document.blocks
        if block.text or block.block_type.value == "PAGE_BREAK"
    ]
    if not blocks:
        return LayoutQuality(0.0, "LOW", ["LAYOUT_NO_BLOCKS"], 0)

    warnings: list[str] = []
    review_count = sum(block.needs_review for block in blocks)
    transform_confidence = sum(block.transformation_confidence for block in blocks) / len(
        blocks
    )
    reading_confidences = [
        _confidence(block.metadata.get("reading_order_confidence"), 0.7)
        for block in blocks
    ]
    reading_confidence = sum(reading_confidences) / len(reading_confidences)
    anchor_coverage = sum(bool(block.source_anchor) for block in blocks) / len(blocks)
    semantic_coverage = sum(
        isinstance(block.metadata.get("semantic_role"), str) for block in blocks
    ) / len(blocks)
    score = (
        transform_confidence * 0.35
        + reading_confidence * 0.25
        + anchor_coverage * 0.2
        + semantic_coverage * 0.2
    )
    score -= min(0.25, review_count / len(blocks) * 0.3)
    if review_count:
        warnings.append("LAYOUT_REVIEW_REQUIRED")
    if reading_confidence < 0.75:
        warnings.append("LAYOUT_READING_ORDER_LOW_CONFIDENCE")
    if anchor_coverage < 1:
        warnings.append("LAYOUT_SOURCE_ANCHOR_INCOMPLETE")
    score = round(max(0.0, min(1.0, score)), 4)
    label = "HIGH" if score >= 0.9 else "MEDIUM" if score >= 0.7 else "LOW"
    return LayoutQuality(score, label, warnings, review_count)

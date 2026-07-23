from __future__ import annotations

from app.services.document_layout.vietnamese_normalizer import (
    DisplayNormalization,
    normalize_vietnamese_display,
)


def reconstruct_paragraph(text: str, language: str) -> DisplayNormalization:
    # The safe whitespace/dehyphenation rules are language-neutral but were
    # calibrated for Vietnamese. Unknown-language content only receives the
    # deterministic punctuation/whitespace path; ambiguous hyphens remain
    # reviewable rather than guessed.
    result = normalize_vietnamese_display(text)
    if language == "und" and any(
        item["rule"] in {"line_break_dehyphenation", "soft_line_break"}
        for item in result.transformations
    ):
        return DisplayNormalization(
            text=result.text,
            transformations=result.transformations,
            confidence=min(result.confidence, 0.75),
            needs_review=True,
        )
    return result

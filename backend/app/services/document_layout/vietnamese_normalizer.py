from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

_SPACE_BEFORE_PUNCTUATION = re.compile(r"[ \t]+([,.;:!?%)\]}])")
_SPACE_AFTER_OPEN = re.compile(r"([(\[{])[ \t]+")
_HORIZONTAL_SPACE = re.compile(r"[\t\f\v ]{2,}")
_DEHYPHENATION = re.compile(r"(?P<left>[^\W\d_]{2,})-\s*\n\s*(?P<right>[^\W\d_]{2,})")
_SOFT_LINE_BREAK = re.compile(r"(?<![.!?:;])\s*\n\s*(?=[^\W_])")
_OTHER_LINE_BREAK = re.compile(r"\s*\n\s*")
_URL_PREFIXES = ("http://", "https://", "www.")


@dataclass(frozen=True)
class DisplayNormalization:
    text: str
    transformations: list[dict[str, object]]
    confidence: float
    needs_review: bool


def _log(rule: str, count: int, confidence: float) -> dict[str, object]:
    return {
        "rule": rule,
        "occurrences": count,
        "confidence": confidence,
    }


def _safe_to_dehyphenate(left: str, right: str) -> bool:
    joined_context = f"{left}-{right}".casefold()
    if joined_context.startswith(_URL_PREFIXES):
        return False
    if left.isupper() or right.isupper():
        return False
    if len(left) <= 2 or len(right) <= 1:
        return False
    return right[:1].islower()


def normalize_vietnamese_display(text: str) -> DisplayNormalization:
    output = text
    transformations: list[dict[str, object]] = []
    confidence = 1.0
    needs_review = False

    normalized_unicode = unicodedata.normalize("NFC", output)
    if normalized_unicode != output:
        output = normalized_unicode
        transformations.append(_log("unicode_nfc", 1, 1.0))

    nbsp_count = output.count("\u00a0")
    if nbsp_count:
        output = output.replace("\u00a0", " ")
        transformations.append(_log("non_breaking_space", nbsp_count, 1.0))

    candidates = list(_DEHYPHENATION.finditer(output))
    accepted = [
        match
        for match in candidates
        if _safe_to_dehyphenate(match.group("left"), match.group("right"))
    ]
    if accepted:
        accepted_spans = {match.span() for match in accepted}

        def replace_hyphen(match: re.Match[str]) -> str:
            if match.span() not in accepted_spans:
                return match.group(0)
            return f"{match.group('left')}{match.group('right')}"

        output = _DEHYPHENATION.sub(replace_hyphen, output)
        transformations.append(_log("line_break_dehyphenation", len(accepted), 0.92))
        confidence = min(confidence, 0.92)
    if len(accepted) != len(candidates):
        needs_review = True
        confidence = min(confidence, 0.68)

    soft_breaks = len(_SOFT_LINE_BREAK.findall(output))
    if soft_breaks:
        output = _SOFT_LINE_BREAK.sub(" ", output)
        transformations.append(_log("soft_line_break", soft_breaks, 0.96))
        confidence = min(confidence, 0.96)

    remaining_breaks = len(_OTHER_LINE_BREAK.findall(output))
    if remaining_breaks:
        output = _OTHER_LINE_BREAK.sub(" ", output)
        transformations.append(_log("line_break_space", remaining_breaks, 0.9))
        confidence = min(confidence, 0.9)

    before_count = len(_SPACE_BEFORE_PUNCTUATION.findall(output))
    if before_count:
        output = _SPACE_BEFORE_PUNCTUATION.sub(r"\1", output)
        transformations.append(_log("space_before_punctuation", before_count, 0.99))
        confidence = min(confidence, 0.99)

    after_open_count = len(_SPACE_AFTER_OPEN.findall(output))
    if after_open_count:
        output = _SPACE_AFTER_OPEN.sub(r"\1", output)
        transformations.append(_log("space_after_open_punctuation", after_open_count, 0.99))
        confidence = min(confidence, 0.99)

    repeated_spaces = len(_HORIZONTAL_SPACE.findall(output))
    if repeated_spaces:
        output = _HORIZONTAL_SPACE.sub(" ", output)
        transformations.append(_log("repeated_horizontal_space", repeated_spaces, 1.0))

    stripped = output.strip()
    if stripped != output:
        output = stripped
        transformations.append(_log("outer_whitespace", 1, 1.0))

    return DisplayNormalization(
        text=output,
        transformations=transformations,
        confidence=max(0.0, min(1.0, round(confidence, 4))),
        needs_review=needs_review,
    )

from __future__ import annotations

import re
from dataclasses import dataclass

_VIETNAMESE_DIACRITICS = re.compile(
    r"[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệ"
    r"ìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]",
    re.IGNORECASE,
)
_WORDS = re.compile(r"\w+", re.UNICODE)
_VIETNAMESE_WORDS = {
    "bài",
    "bảng",
    "các",
    "cho",
    "chương",
    "của",
    "điều",
    "được",
    "hình",
    "không",
    "là",
    "một",
    "này",
    "những",
    "phần",
    "trong",
    "và",
    "với",
}
_ENGLISH_WORDS = {
    "and",
    "chapter",
    "document",
    "for",
    "from",
    "in",
    "is",
    "of",
    "section",
    "that",
    "the",
    "this",
    "to",
    "with",
}


@dataclass(frozen=True)
class LanguageDetection:
    code: str
    confidence: float
    vietnamese_signals: int
    english_signals: int


def detect_language(text: str) -> LanguageDetection:
    sample = text[:50_000].casefold()
    words = _WORDS.findall(sample)
    vietnamese_signals = len(_VIETNAMESE_DIACRITICS.findall(sample))
    vietnamese_signals += sum(word in _VIETNAMESE_WORDS for word in words) * 2
    english_signals = sum(word in _ENGLISH_WORDS for word in words) * 2

    total = vietnamese_signals + english_signals
    if total == 0:
        return LanguageDetection("und", 0.0, 0, 0)
    if vietnamese_signals > english_signals:
        confidence = min(0.99, 0.55 + vietnamese_signals / max(total, 1) * 0.44)
        return LanguageDetection(
            "vi", round(confidence, 4), vietnamese_signals, english_signals
        )
    confidence = min(0.98, 0.55 + english_signals / max(total, 1) * 0.42)
    return LanguageDetection(
        "en", round(confidence, 4), vietnamese_signals, english_signals
    )

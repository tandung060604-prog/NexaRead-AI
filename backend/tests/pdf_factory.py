# mypy: disable-error-code="no-untyped-call"

from dataclasses import dataclass
from pathlib import Path

import pymupdf


@dataclass(frozen=True)
class TextSpec:
    text: str
    x: float
    y: float
    size: float = 11
    font: str = "helv"
    unicode_font: bool = False


def _unicode_font_path() -> Path:
    candidates = (
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise RuntimeError("A Unicode test font is required to generate PDF fixtures")


def make_pdf(
    pages: list[list[TextSpec]],
    *,
    metadata: dict[str, str] | None = None,
    toc: list[list[object]] | None = None,
) -> bytes:
    document = pymupdf.open()
    needs_unicode = any(spec.unicode_font for page in pages for spec in page)
    unicode_font = _unicode_font_path() if needs_unicode else None
    for specs in pages:
        page = document.new_page(width=595, height=842)
        if unicode_font is not None and any(spec.unicode_font for spec in specs):
            page.insert_font(fontname="fixture-unicode", fontfile=str(unicode_font))
        for spec in specs:
            font_name = "fixture-unicode" if spec.unicode_font else spec.font
            page.insert_text(
                (spec.x, spec.y),
                spec.text,
                fontsize=spec.size,
                fontname=font_name,
            )
    if metadata:
        document.set_metadata(metadata)
    if toc:
        document.set_toc(toc)
    data: bytes = document.tobytes()
    document.close()
    return data


def make_blank_pdf() -> bytes:
    document = pymupdf.open()
    page = document.new_page(width=595, height=842)
    page.draw_rect((72, 72, 520, 770), color=(0, 0, 0))
    data: bytes = document.tobytes()
    document.close()
    return data

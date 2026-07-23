# mypy: disable-error-code="no-untyped-call"

from __future__ import annotations

import base64
import hashlib
import html
import re
import textwrap
from dataclasses import dataclass
from io import BytesIO
from typing import Any
from zipfile import BadZipFile, ZipFile

import pymupdf
from bs4 import BeautifulSoup
from ebooklib import ITEM_IMAGE, epub  # type: ignore[import-untyped]

MAX_COVER_SOURCE_BYTES = 10 * 1024 * 1024
THUMBNAIL_WIDTH = 480
THUMBNAIL_HEIGHT = 640
_RASTER_MEDIA_TYPES = {
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
}
_DATA_IMAGE = re.compile(
    r"^data:(image/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=\s]+)$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class CoverArtifact:
    data: bytes
    media_type: str
    source: str
    extension: str
    content_hash: str


def _artifact(data: bytes, media_type: str, source: str, extension: str) -> CoverArtifact:
    return CoverArtifact(
        data=data,
        media_type=media_type,
        source=source,
        extension=extension,
        content_hash=hashlib.sha256(data).hexdigest(),
    )


def _render_thumbnail(
    data: bytes,
    *,
    filetype: str,
    source: str,
) -> CoverArtifact | None:
    if not data or len(data) > MAX_COVER_SOURCE_BYTES:
        return None
    try:
        with pymupdf.open(stream=data, filetype=filetype) as image:
            if image.page_count < 1:
                return None
            page = image[0]
            width = max(float(page.rect.width), 1.0)
            height = max(float(page.rect.height), 1.0)
            scale = min(1.0, THUMBNAIL_WIDTH / width, THUMBNAIL_HEIGHT / height)
            pixmap = page.get_pixmap(
                matrix=pymupdf.Matrix(scale, scale),
                alpha=False,
            )
            rendered = pixmap.tobytes("png")
    except (RuntimeError, ValueError, TypeError):
        return None
    return _artifact(rendered, "image/png", source, "png")


def _pdf_cover(data: bytes) -> CoverArtifact | None:
    if not data:
        return None
    try:
        with pymupdf.open(stream=data, filetype="pdf") as document:
            if document.page_count < 1 or document.needs_pass:
                return None
            page = document[0]
            width = max(float(page.rect.width), 1.0)
            height = max(float(page.rect.height), 1.0)
            scale = min(
                2.0,
                THUMBNAIL_WIDTH / width,
                THUMBNAIL_HEIGHT / height,
            )
            pixmap = page.get_pixmap(
                matrix=pymupdf.Matrix(scale, scale),
                alpha=False,
            )
            rendered = pixmap.tobytes("png")
    except (RuntimeError, ValueError, TypeError):
        return None
    return _artifact(rendered, "image/png", "pdf_first_page", "png")


def _epub_cover(data: bytes) -> tuple[CoverArtifact | None, str | None]:
    try:
        book = epub.read_epub(BytesIO(data), options={"ignore_ncx": False})
    except Exception:
        return None, None

    author_values = book.get_metadata("DC", "creator")
    author = str(author_values[0][0]).strip() if author_values else None
    candidates: list[tuple[int, Any]] = []
    for item in book.get_items():
        if item.get_type() != ITEM_IMAGE and not str(
            getattr(item, "media_type", "")
        ).casefold().startswith("image/"):
            continue
        file_name = str(getattr(item, "file_name", ""))
        properties = {
            str(value).casefold()
            for value in getattr(item, "properties", [])
        }
        item_id = str(item.get_id()).casefold()
        score = 0
        if "cover-image" in properties:
            score += 100
        if "cover" in item_id:
            score += 50
        if "cover" in file_name.casefold():
            score += 25
        if score:
            candidates.append((score, item))
    for _, item in sorted(candidates, key=lambda candidate: candidate[0], reverse=True):
        media_type = str(getattr(item, "media_type", "")).casefold()
        filetype = _RASTER_MEDIA_TYPES.get(media_type)
        if not filetype:
            continue
        content = bytes(item.get_content())
        thumbnail = _render_thumbnail(
            content,
            filetype=filetype,
            source="epub_cover",
        )
        if thumbnail:
            return thumbnail, author
    return None, author


def _zip_metadata_image(data: bytes, source_type: str) -> CoverArtifact | None:
    if source_type not in {"docx", "epub"}:
        return None
    try:
        with ZipFile(BytesIO(data)) as archive:
            names = archive.namelist()
            preferred = [
                name
                for name in names
                if name.casefold().startswith("docprops/thumbnail.")
            ]
            fallback_prefix = "word/media/" if source_type == "docx" else ""
            fallback = [
                name
                for name in names
                if fallback_prefix
                and name.casefold().startswith(fallback_prefix)
                and name.casefold().endswith((".png", ".jpg", ".jpeg", ".webp"))
            ]
            for name in preferred + fallback[:1]:
                info = archive.getinfo(name)
                if info.file_size <= 0 or info.file_size > MAX_COVER_SOURCE_BYTES:
                    continue
                suffix = name.rsplit(".", 1)[-1].casefold()
                filetype = "jpeg" if suffix in {"jpg", "jpeg"} else suffix
                if filetype not in {"jpeg", "png", "webp"}:
                    continue
                thumbnail = _render_thumbnail(
                    archive.read(name),
                    filetype=filetype,
                    source="metadata_image",
                )
                if thumbnail:
                    return thumbnail
    except (BadZipFile, KeyError, OSError):
        return None
    return None


def _embedded_html_image(data: bytes) -> CoverArtifact | None:
    soup = BeautifulSoup(data, "html.parser")
    node = soup.find(
        "meta",
        attrs={"property": lambda value: value in {"og:image", "twitter:image"}},
    )
    content = str(node.get("content", "")) if node else ""
    match = _DATA_IMAGE.fullmatch(content.strip())
    if not match:
        return None
    try:
        image_data = base64.b64decode(match.group(2), validate=True)
    except (ValueError, TypeError):
        return None
    media_type = match.group(1).casefold()
    filetype = _RASTER_MEDIA_TYPES.get(media_type)
    return (
        _render_thumbnail(
            image_data,
            filetype=filetype,
            source="metadata_image",
        )
        if filetype
        else None
    )


def _document_author(data: bytes, source_type: str) -> str | None:
    if source_type == "pdf":
        try:
            with pymupdf.open(stream=data, filetype="pdf") as document:
                author = str((document.metadata or {}).get("author", "")).strip()
                return author[:160] or None
        except (RuntimeError, ValueError, TypeError):
            return None
    if source_type == "docx":
        try:
            with ZipFile(BytesIO(data)) as archive:
                core = archive.read("docProps/core.xml")
            soup = BeautifulSoup(core, "xml")
            creator = soup.find(lambda tag: tag.name and tag.name.endswith("creator"))
            return creator.get_text(strip=True)[:160] if creator else None
        except (BadZipFile, KeyError, OSError):
            return None
    if source_type == "url":
        soup = BeautifulSoup(data, "html.parser")
        author_node = soup.find(
            "meta",
            attrs={"name": re.compile("^author$", re.IGNORECASE)},
        )
        return (
            str(author_node.get("content", "")).strip()[:160] or None
            if author_node
            else None
        )
    return None


def generated_cover(
    *,
    title: str,
    author: str | None,
    document_type: str,
) -> CoverArtifact:
    identity = f"{title}\0{author or ''}\0{document_type}".encode()
    digest = hashlib.sha256(identity).digest()
    hue = int.from_bytes(digest[:2], "big") % 360
    accent_hue = (hue + 26 + digest[2] % 42) % 360
    safe_title = html.escape(title.strip()[:240] or "Untitled")
    safe_author = html.escape((author or "").strip()[:160])
    safe_type = html.escape(document_type.strip().upper()[:48])
    title_lines = textwrap.wrap(safe_title, width=24, break_long_words=True)[:6]
    line_markup = "".join(
        f'<text x="54" y="{190 + index * 48}" class="title">{line}</text>'
        for index, line in enumerate(title_lines)
    )
    pattern_offset = 18 + digest[3] % 42
    author_markup = (
        f'<text x="54" y="562" class="author">{safe_author}</text>'
        if safe_author
        else ""
    )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" '
        f'viewBox="0 0 480 640" role="img" aria-label="{safe_title}">'
        f'<rect width="480" height="640" fill="hsl({hue} 42% 24%)"/>'
        f'<path d="M0 0h480v{pattern_offset}L0 {pattern_offset + 116}z" '
        f'fill="hsl({accent_hue} 58% 48%)" opacity=".9"/>'
        '<path d="M0 640h480V490L0 570z" '
        f'fill="hsl({accent_hue} 50% 38%)" opacity=".55"/>'
        '<g opacity=".14" stroke="white" stroke-width="2">'
        '<path d="M40 88h400M40 112h320M40 136h360"/>'
        '<circle cx="390" cy="390" r="110" fill="none"/>'
        '<circle cx="390" cy="390" r="76" fill="none"/></g>'
        '<rect width="18" height="640" fill="black" opacity=".25"/>'
        '<rect x="18" width="3" height="640" fill="white" opacity=".16"/>'
        "<style>"
        ".title{font:700 34px system-ui,sans-serif;fill:white}"
        ".type{font:700 15px system-ui,sans-serif;letter-spacing:3px;"
        "fill:white;opacity:.82}"
        ".author{font:500 18px system-ui,sans-serif;fill:white;opacity:.86}"
        "</style>"
        f'<text x="54" y="116" class="type">{safe_type}</text>'
        f"{line_markup}{author_markup}"
        '<text x="54" y="602" class="type">NEXAREAD</text></svg>'
    )
    data = svg.encode("utf-8")
    return _artifact(data, "image/svg+xml", "generated", "svg")


def generate_document_cover(
    data: bytes,
    *,
    source_type: str,
    title: str,
    document_type: str,
) -> CoverArtifact:
    author: str | None = None
    if source_type == "epub":
        cover, author = _epub_cover(data)
        if cover:
            return cover
    if source_type == "pdf":
        cover = _pdf_cover(data)
        if cover:
            return cover
    metadata_cover = (
        _embedded_html_image(data)
        if source_type == "url"
        else _zip_metadata_image(data, source_type)
    )
    if metadata_cover:
        return metadata_cover
    author = author or _document_author(data, source_type)
    return generated_cover(
        title=title,
        author=author,
        document_type=document_type,
    )

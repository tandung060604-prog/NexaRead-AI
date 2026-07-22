from __future__ import annotations

from app.services.docx_parser import parse_docx
from app.services.epub_parser import parse_epub
from app.services.normalized_document import DocumentParseError, NormalizedDocument
from app.services.pdf_parser import PdfNeedsOcrError, parse_pdf
from app.services.web_parser import parse_web_page

LAYOUT_TYPES = {
    "BOOK",
    "PAPER",
    "TECHNICAL_DOCUMENTATION",
    "BLOG_ARTICLE",
    "GENERAL_DOCUMENT",
}


def classify_layout(document: NormalizedDocument, source_type: str) -> str:
    if source_type == "epub":
        return "BOOK"
    if source_type == "url":
        return "BLOG_ARTICLE"
    text = " ".join(block.text.casefold() for block in document.blocks[:80])
    if any(marker in text for marker in ("abstract", "methodology", "references", "doi:")):
        return "PAPER"
    code_blocks = sum(block.block_type.value == "CODE" for block in document.blocks)
    if code_blocks >= 2 or any(
        marker in text for marker in ("api reference", "installation", "usage")
    ):
        return "TECHNICAL_DOCUMENTATION"
    if len(document.outline) >= 5 and document.page_count >= 10:
        return "BOOK"
    return "GENERAL_DOCUMENT"


def parse_document(
    data: bytes,
    source_type: str,
    *,
    source_url: str | None = None,
    minimum_text_characters: int = 20,
) -> NormalizedDocument:
    if source_type == "pdf":
        parsed = parse_pdf(data, minimum_text_characters=minimum_text_characters)
    elif source_type == "docx":
        parsed = parse_docx(data)
    elif source_type == "epub":
        parsed = parse_epub(data)
    elif source_type == "url" and source_url:
        parsed = parse_web_page(data, source_url)
    else:
        raise DocumentParseError("UNSUPPORTED_SOURCE_TYPE")
    parsed.metadata["layout_type"] = classify_layout(parsed, source_type)
    parsed.metadata["warnings"] = parsed.warnings
    parsed.metadata["assets"] = [
        {
            "local_id": asset.local_id,
            "asset_type": asset.asset_type,
            "content_type": asset.content_type,
            "source_reference": asset.source_reference,
            "metadata": asset.metadata,
        }
        for asset in parsed.assets
    ]
    return parsed


__all__ = ["DocumentParseError", "PdfNeedsOcrError", "parse_document"]

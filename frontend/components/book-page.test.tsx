import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContentBlock } from "@/lib/documents-api";
import type { PaginatedBlock } from "@/lib/measured-pagination";

import { BookPage } from "./book-page";

const block: ContentBlock = {
  id: "block-1",
  parent_block_id: null,
  sequence_number: 1,
  block_type: "PARAGRAPH",
  text: "Measured page content.",
  source_text: "Measured page content.",
  display_text: "Measured page content.",
  transformation_log: [],
  transformation_confidence: 1,
  needs_review: false,
  source_anchor: { page_number: 1 },
  semantic_role: "paragraph",
  heading_level: null,
  keep_with_next: false,
  avoid_break_inside: false,
  break_before: false,
  break_after: false,
  indent_level: 0,
  text_align: "left",
  is_first_paragraph: false,
  is_chapter_opening: false,
  caption_for_asset_id: null,
  footnote_reference: null,
  source_page_number: 1,
  page_number: 1,
  chapter_index: null,
  section_index: null,
  paragraph_index: 1,
  start_offset: 0,
  end_offset: 22,
  bounding_box: [0, 0, 100, 20],
  font_name: null,
  font_size: null,
  is_bold: false,
  is_italic: false,
  confidence: 1,
  metadata: {},
  content_hash: "hash",
  created_at: "2026-07-23T00:00:00Z",
};
const pageItem: PaginatedBlock = {
  block,
  startOffset: 0,
  endOffset: block.text.length,
  measuredHeight: 80,
  oversized: false,
};

function renderPage(onOverflow = vi.fn()) {
  return render(
    <BookPage
      animationClass=""
      blocks={[pageItem]}
      bookmarks={new Map()}
      highlightQuery=""
      highlightedBlock={null}
      highlights={new Map()}
      keywords={new Map()}
      keywordsEnabled={true}
      onBookmark={vi.fn()}
      onKeywordSelect={vi.fn()}
      onOverflow={onOverflow}
      onSelection={vi.fn()}
      pageColor="#fff"
      pageHeight={640}
      pageNumber={1}
      pageTextureOpacity={0}
      position="single"
      style={{
        fontFamily: "serif",
        fontSize: 17,
        lineHeight: 1.8,
        readingWidth: 600,
      }}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BookPage", () => {
  it("does not create a nested vertical scroll region", () => {
    const view = renderPage();
    const content = view.container.querySelector("[data-book-page-content]");

    expect(content).toHaveClass("overflow-hidden");
    expect(content).not.toHaveClass("overflow-y-auto");
    expect(content).not.toHaveClass("overflow-auto");
    expect(view.container.querySelector(".hide-scrollbar")).not.toBeInTheDocument();
  });

  it("reports late rendered overflow so the engine can repaginate", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockImplementation(function clientHeight(this: HTMLElement) {
        return this.dataset.bookPageContent ? 200 : 0;
      });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockImplementation(function scrollHeight(this: HTMLElement) {
        return this.dataset.bookPageContent ? 248 : 0;
      });
    const onOverflow = vi.fn();

    renderPage(onOverflow);

    await waitFor(() => expect(onOverflow).toHaveBeenCalledWith(1, 48));
  });

  it("scales a single unsplittable oversized asset into available page space", () => {
    const oversized: PaginatedBlock = {
      ...pageItem,
      block: { ...block, block_type: "IMAGE" },
      measuredHeight: 900,
      oversized: true,
    };
    const view = render(
      <BookPage
        animationClass=""
        blocks={[oversized]}
        bookmarks={new Map()}
        highlightQuery=""
        highlightedBlock={null}
        highlights={new Map()}
        keywords={new Map()}
        keywordsEnabled={false}
        onBookmark={vi.fn()}
        onKeywordSelect={vi.fn()}
        onSelection={vi.fn()}
        pageColor="#fff"
        pageHeight={640}
        pageNumber={1}
        pageTextureOpacity={0}
        position="single"
        style={{
          fontFamily: "serif",
          fontSize: 17,
          lineHeight: 1.8,
          readingWidth: 600,
        }}
      />,
    );

    const fitted = view.container.querySelector("[data-oversized-fit]");
    expect(fitted).toBeInTheDocument();
    expect(fitted?.firstElementChild).toHaveStyle({
      transformOrigin: "top left",
    });
    expect(fitted?.getAttribute("style")).toContain("height:");
  });
});

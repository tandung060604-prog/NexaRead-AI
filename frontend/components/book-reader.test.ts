import { describe, expect, it } from "vitest";

import type { ContentBlock } from "@/lib/documents-api";
import type { MeasuredPage, PaginatedBlock } from "@/lib/measured-pagination";

import { buildBookDisplayPages } from "./book-reader";

function pageItem(
  id: string,
  text: string,
  chapterOpening = false,
): PaginatedBlock {
  const block = {
    id,
    block_type: chapterOpening ? "HEADING_1" : "PARAGRAPH",
    display_text: text,
    text,
    heading_level: chapterOpening ? 1 : null,
    is_chapter_opening: chapterOpening,
  } as ContentBlock;
  return {
    block,
    startOffset: 0,
    endOffset: text.length,
    measuredHeight: 80,
    oversized: false,
  };
}

describe("book display pages", () => {
  it("adds cover and title leaves and opens chapters on the right", () => {
    const contentPages: MeasuredPage[] = [
      { items: [pageItem("chapter", "Chapter One", true)], usedHeight: 80 },
      { items: [pageItem("body", "Body")], usedHeight: 80 },
    ];

    const pages = buildBookDisplayPages(contentPages);

    expect(pages.map((page) => page.kind)).toEqual([
      "cover",
      "title",
      "blank",
      "content",
      "content",
    ]);
    expect(pages[3].chapterTitle).toBe("Chapter One");
    expect(pages[4].chapterTitle).toBe("Chapter One");
    expect(pages[3].contentPageNumber).toBe(1);
  });
});

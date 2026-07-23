import { afterEach, describe, expect, it } from "vitest";

import type { ContentBlock } from "./documents-api";
import {
  BlockMeasurementMap,
  clearPaginationCache,
  createPaginationCacheKey,
  estimateBlockHeight,
  getCachedPageMap,
  paginateMeasuredBlocks,
  safeTextRanges,
  setCachedPageMap,
} from "./measured-pagination";

function makeBlock(
  id: string,
  text: string,
  overrides: Partial<ContentBlock> = {},
): ContentBlock {
  return {
    id,
    parent_block_id: null,
    sequence_number: Number(id.replace(/\D/g, "")) || 1,
    block_type: "PARAGRAPH",
    text,
    source_text: text,
    display_text: text,
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
    end_offset: text.length,
    bounding_box: [0, 0, 100, 20],
    font_name: null,
    font_size: null,
    is_bold: false,
    is_italic: false,
    confidence: 1,
    metadata: {},
    content_hash: `hash-${id}`,
    created_at: "2026-07-23T00:00:00Z",
    ...overrides,
  };
}

const metrics = {
  availableHeight: 100,
  contentWidth: 420,
  fontSize: 17,
  lineHeight: 1.8,
};

afterEach(clearPaginationCache);

describe("measured pagination", () => {
  it("uses every cache dimension and stores the page map", () => {
    const input = {
      documentVersionId: "version-1",
      contentRevision: "revision-1",
      viewportWidth: 1200,
      viewportHeight: 800,
      fontFamily: "serif",
      fontSize: 17,
      lineHeight: 1.8,
      readingWidth: 720,
      readingMode: "book-spread",
    };
    const key = createPaginationCacheKey(input);
    const changed = createPaginationCacheKey({ ...input, viewportHeight: 801 });
    const pages = [{ items: [], usedHeight: 0 }];

    setCachedPageMap(key, pages);

    expect(changed).not.toBe(key);
    expect(getCachedPageMap(key)).toBe(pages);
  });

  it("uses measured DOM heights instead of text-length constants", () => {
    const blocks = [
      makeBlock("block-1", "Short one."),
      makeBlock("block-2", "Short two."),
      makeBlock("block-3", "Short three."),
    ];
    const measurements: BlockMeasurementMap = new Map(
      blocks.map((block) => [
        block.id,
        { blockId: block.id, height: 60, ranges: [] },
      ]),
    );

    const pages = paginateMeasuredBlocks(blocks, measurements, metrics);

    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.items[0].block.id)).toEqual([
      "block-1",
      "block-2",
      "block-3",
    ]);
  });

  it("moves keep-with-next headings together with following content", () => {
    const intro = makeBlock("block-1", "Intro.");
    const heading = makeBlock("block-2", "Heading", {
      block_type: "HEADING_2",
      heading_level: 2,
      keep_with_next: true,
      semantic_role: "heading",
    });
    const body = makeBlock("block-3", "Body.");
    const measurements: BlockMeasurementMap = new Map([
      [intro.id, { blockId: intro.id, height: 30, ranges: [] }],
      [heading.id, { blockId: heading.id, height: 20, ranges: [] }],
      [body.id, { blockId: body.id, height: 70, ranges: [] }],
    ]);

    const pages = paginateMeasuredBlocks(
      [intro, heading, body],
      measurements,
      metrics,
    );

    expect(pages).toHaveLength(2);
    expect(pages[0].items.map((item) => item.block.id)).toEqual(["block-1"]);
    expect(pages[1].items.map((item) => item.block.id)).toEqual([
      "block-2",
      "block-3",
    ]);
  });

  it("keeps avoid-break-inside blocks atomic and moves them to the next page", () => {
    const first = makeBlock("block-1", "First.");
    const quote = makeBlock("block-2", "A short quote.", {
      avoid_break_inside: true,
      block_type: "QUOTE",
    });
    const measurements: BlockMeasurementMap = new Map([
      [first.id, { blockId: first.id, height: 40, ranges: [] }],
      [quote.id, { blockId: quote.id, height: 80, ranges: [] }],
    ]);

    const pages = paginateMeasuredBlocks([first, quote], measurements, metrics);

    expect(pages).toHaveLength(2);
    expect(pages[1].items).toHaveLength(1);
    expect(pages[1].items[0]).toMatchObject({
      block: quote,
      startOffset: 0,
      endOffset: quote.text.length,
      oversized: false,
    });
  });

  it("splits an oversized paragraph only at safe source ranges", () => {
    const text = "First sentence. Second sentence. Third sentence.";
    const block = makeBlock("block-1", text);
    const ranges = safeTextRanges(text);
    const measurements: BlockMeasurementMap = new Map([
      [
        block.id,
        {
          blockId: block.id,
          height: 240,
          ranges: ranges.map((range) => ({ ...range, height: 60 })),
        },
      ],
    ]);

    const pages = paginateMeasuredBlocks([block], measurements, metrics);
    const fragments = pages.flatMap((page) => page.items);

    expect(pages).toHaveLength(3);
    expect(fragments.map((item) =>
      text.slice(item.startOffset, item.endOffset),
    )).toEqual([
      "First sentence. ",
      "Second sentence. ",
      "Third sentence.",
    ]);
    expect(fragments[0].block).toBe(block);
    expect(fragments.at(-1)?.endOffset).toBe(text.length);
  });

  it("covers long unpunctuated text without losing source characters", () => {
    const text = Array.from({ length: 160 }, (_, index) => `word${index}`).join(" ");
    const ranges = safeTextRanges(text, 120);

    expect(ranges[0].startOffset).toBe(0);
    expect(ranges.at(-1)?.endOffset).toBe(text.length);
    expect(ranges.map((range) => text.slice(
      range.startOffset,
      range.endOffset,
    )).join("")).toBe(text);
    expect(ranges.every((range) => range.endOffset > range.startOffset)).toBe(true);
  });

  it("falls back using current width and typography when DOM measurement fails", () => {
    const block = makeBlock("block-1", "A ".repeat(300));
    const wide = estimateBlockHeight(block, { ...metrics, contentWidth: 800 });
    const narrow = estimateBlockHeight(block, { ...metrics, contentWidth: 280 });
    const largeFont = estimateBlockHeight(block, {
      ...metrics,
      contentWidth: 800,
      fontSize: 24,
    });

    expect(narrow).toBeGreaterThan(wide);
    expect(largeFont).toBeGreaterThan(wide);
  });

  it("paginates a 5,000-block, 100+ page document within bounded resources", () => {
    const blocks = Array.from({ length: 5_000 }, (_, index) =>
      makeBlock(
        `block-${index + 1}`,
        `Đoạn văn kiểm thử hiệu năng số ${index + 1}.`,
      ),
    );
    const measurements: BlockMeasurementMap = new Map(
      blocks.map((block) => [
        block.id,
        { blockId: block.id, height: 48, ranges: [] },
      ]),
    );
    const heapBefore = process.memoryUsage().heapUsed;
    const startedAt = performance.now();

    const pages = paginateMeasuredBlocks(blocks, measurements, {
      ...metrics,
      availableHeight: 640,
    });

    const duration = performance.now() - startedAt;
    const heapGrowth = Math.max(
      0,
      process.memoryUsage().heapUsed - heapBefore,
    );
    expect(pages.length).toBeGreaterThan(100);
    expect(duration).toBeLessThan(1_500);
    expect(heapGrowth).toBeLessThan(128 * 1024 * 1024);
  });

  it("repaginates after font and viewport changes", () => {
    const blocks = Array.from({ length: 500 }, (_, index) =>
      makeBlock(
        `block-${index + 1}`,
        `Nội dung tiếng Việt dài để kiểm tra reflow theo phông chữ và kích thước khung đọc. `.repeat(
          3,
        ),
      ),
    );
    const baseInput = {
      documentVersionId: "version-1",
      contentRevision: "revision-1",
      viewportWidth: 1280,
      viewportHeight: 800,
      fontFamily: "serif",
      fontSize: 17,
      lineHeight: 1.8,
      readingWidth: 720,
      readingMode: "book-spread",
    };
    const startedAt = performance.now();
    const standard = paginateMeasuredBlocks(blocks, new Map(), {
      availableHeight: 620,
      contentWidth: 620,
      fontSize: 17,
      lineHeight: 1.8,
    });
    const largerFont = paginateMeasuredBlocks(blocks, new Map(), {
      availableHeight: 620,
      contentWidth: 620,
      fontSize: 24,
      lineHeight: 1.8,
    });
    const narrowViewport = paginateMeasuredBlocks(blocks, new Map(), {
      availableHeight: 620,
      contentWidth: 300,
      fontSize: 17,
      lineHeight: 1.8,
    });

    expect(largerFont.length).toBeGreaterThan(standard.length);
    expect(narrowViewport.length).toBeGreaterThan(standard.length);
    expect(
      createPaginationCacheKey({
        ...baseInput,
        fontFamily: "sans",
        fontSize: 24,
      }),
    ).not.toBe(createPaginationCacheKey(baseInput));
    expect(
      createPaginationCacheKey({
        ...baseInput,
        viewportWidth: 768,
        readingWidth: 540,
      }),
    ).not.toBe(createPaginationCacheKey(baseInput));
    expect(performance.now() - startedAt).toBeLessThan(1_500);
  });
});

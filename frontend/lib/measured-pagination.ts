import type { ContentBlock } from "./documents-api";

export type TextRangeMeasurement = {
  startOffset: number;
  endOffset: number;
  height: number;
};

export type BlockMeasurement = {
  blockId: string;
  height: number;
  ranges: TextRangeMeasurement[];
};

export type BlockMeasurementMap = Map<string, BlockMeasurement>;

export type PaginatedBlock = {
  block: ContentBlock;
  startOffset: number;
  endOffset: number;
  measuredHeight: number;
  oversized: boolean;
};

export type MeasuredPage = {
  items: PaginatedBlock[];
  usedHeight: number;
};

export type PaginationMetrics = {
  availableHeight: number;
  contentWidth: number;
  fontSize: number;
  lineHeight: number;
};

export type PaginationCacheKeyInput = {
  documentVersionId: string;
  contentRevision: string;
  viewportWidth: number;
  viewportHeight: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  readingWidth: number;
  readingMode: string;
};

const SPLITTABLE_TYPES = new Set([
  "PARAGRAPH",
  "LIST_ITEM",
  "QUOTE",
  "CODE",
]);
const pageMapCache = new Map<string, MeasuredPage[]>();
const MAX_CACHE_ENTRIES = 40;

export function createPaginationCacheKey(input: PaginationCacheKeyInput): string {
  return JSON.stringify([
    input.documentVersionId,
    input.contentRevision,
    Math.round(input.viewportWidth),
    Math.round(input.viewportHeight),
    input.fontFamily,
    input.fontSize,
    input.lineHeight,
    input.readingWidth,
    input.readingMode,
  ]);
}

export function getCachedPageMap(key: string): MeasuredPage[] | undefined {
  return pageMapCache.get(key);
}

export function setCachedPageMap(key: string, pages: MeasuredPage[]): void {
  if (pageMapCache.has(key)) pageMapCache.delete(key);
  pageMapCache.set(key, pages);
  while (pageMapCache.size > MAX_CACHE_ENTRIES) {
    const oldest = pageMapCache.keys().next().value;
    if (typeof oldest !== "string") break;
    pageMapCache.delete(oldest);
  }
}

export function clearPaginationCache(): void {
  pageMapCache.clear();
}

function chunkLongRange(
  text: string,
  startOffset: number,
  endOffset: number,
  maximumCharacters: number,
): Array<{ startOffset: number; endOffset: number }> {
  const ranges: Array<{ startOffset: number; endOffset: number }> = [];
  let start = startOffset;
  while (endOffset - start > maximumCharacters) {
    const target = Math.min(endOffset, start + maximumCharacters);
    const windowStart = Math.min(target, start + Math.floor(maximumCharacters * 0.55));
    let split = -1;
    for (let index = target; index >= windowStart; index -= 1) {
      if (/\s/.test(text[index] ?? "")) {
        split = index + 1;
        break;
      }
    }
    if (split <= start) split = target;
    ranges.push({ startOffset: start, endOffset: split });
    start = split;
  }
  if (start < endOffset) ranges.push({ startOffset: start, endOffset });
  return ranges;
}

export function safeTextRanges(
  text: string,
  maximumCharacters = 360,
): Array<{ startOffset: number; endOffset: number }> {
  if (!text) return [];
  const sentenceRanges: Array<{ startOffset: number; endOffset: number }> = [];
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const Segmenter = Intl.Segmenter;
    const segmenter = new Segmenter(undefined, { granularity: "sentence" });
    for (const item of segmenter.segment(text)) {
      sentenceRanges.push({
        startOffset: item.index,
        endOffset: item.index + item.segment.length,
      });
    }
  } else {
    const boundary = /[^.!?…]+(?:[.!?…]+(?:\s+|$)|$)/gu;
    for (const match of text.matchAll(boundary)) {
      const startOffset = match.index;
      sentenceRanges.push({
        startOffset,
        endOffset: startOffset + match[0].length,
      });
    }
  }
  if (!sentenceRanges.length) {
    sentenceRanges.push({ startOffset: 0, endOffset: text.length });
  }

  const output = sentenceRanges.flatMap((range) =>
    range.endOffset - range.startOffset > maximumCharacters
      ? chunkLongRange(
          text,
          range.startOffset,
          range.endOffset,
          maximumCharacters,
        )
      : [range],
  );
  const covered: Array<{ startOffset: number; endOffset: number }> = [];
  let cursor = 0;
  for (const range of output) {
    if (range.startOffset > cursor) {
      covered.push({ startOffset: cursor, endOffset: range.startOffset });
    }
    if (range.endOffset > range.startOffset) covered.push(range);
    cursor = Math.max(cursor, range.endOffset);
  }
  if (cursor < text.length) covered.push({ startOffset: cursor, endOffset: text.length });
  return covered;
}

export function safeRangeCharacterLimit(metrics: PaginationMetrics): number {
  const averageCharacterWidth = metrics.fontSize * 0.52;
  const charactersPerLine = Math.max(
    12,
    Math.floor(metrics.contentWidth / averageCharacterWidth),
  );
  const lineHeightPixels = metrics.fontSize * metrics.lineHeight;
  const availableLines = Math.max(
    2,
    Math.floor(metrics.availableHeight / lineHeightPixels),
  );
  return Math.max(
    40,
    Math.min(360, Math.floor(charactersPerLine * availableLines * 0.75)),
  );
}

export function estimateBlockHeight(
  block: ContentBlock,
  metrics: PaginationMetrics,
  startOffset = 0,
  endOffset = block.text.length,
): number {
  const text = block.text.slice(startOffset, endOffset);
  const lineHeightPixels = metrics.fontSize * metrics.lineHeight;
  const averageCharacterWidth = metrics.fontSize * 0.52;
  const charactersPerLine = Math.max(
    12,
    Math.floor(metrics.contentWidth / averageCharacterWidth),
  );
  const lines = Math.max(1, Math.ceil(text.length / charactersPerLine));
  if (block.block_type === "IMAGE") {
    const rawHeight = block.metadata.height;
    return typeof rawHeight === "number"
      ? Math.min(metrics.availableHeight, Math.max(120, rawHeight))
      : Math.min(metrics.availableHeight, metrics.contentWidth * 0.7);
  }
  if (block.block_type === "TABLE") {
    const rows = Array.isArray(block.metadata.rows) ? block.metadata.rows.length : lines;
    return Math.min(
      metrics.availableHeight,
      Math.max(lineHeightPixels * 3, rows * lineHeightPixels * 1.25 + 40),
    );
  }
  if (block.block_type.startsWith("HEADING")) {
    const scale = block.block_type === "HEADING_1" ? 1.65 : block.block_type === "HEADING_2" ? 1.4 : 1.2;
    return lines * lineHeightPixels * scale + lineHeightPixels * 1.2;
  }
  if (block.block_type === "CODE") {
    const codeLines = Math.max(1, text.split("\n").length);
    return codeLines * lineHeightPixels + 56;
  }
  return lines * lineHeightPixels + lineHeightPixels * 0.55;
}

function validHeight(height: number | undefined): height is number {
  return typeof height === "number" && Number.isFinite(height) && height > 0;
}

function measurementHeight(
  block: ContentBlock,
  measurements: BlockMeasurementMap,
  metrics: PaginationMetrics,
): number {
  const measured = measurements.get(block.id)?.height;
  return validHeight(measured) ? measured : estimateBlockHeight(block, metrics);
}

function rangeMeasurements(
  block: ContentBlock,
  measurements: BlockMeasurementMap,
  metrics: PaginationMetrics,
): TextRangeMeasurement[] {
  const measured = measurements.get(block.id)?.ranges ?? [];
  const byRange = new Map(
    measured
      .filter((range) => validHeight(range.height))
      .map((range) => [`${range.startOffset}:${range.endOffset}`, range.height]),
  );
  return safeTextRanges(
    block.text,
    safeRangeCharacterLimit(metrics),
  ).map((range) => ({
    ...range,
    height:
      byRange.get(`${range.startOffset}:${range.endOffset}`)
      ?? estimateBlockHeight(
        block,
        metrics,
        range.startOffset,
        range.endOffset,
      ),
  }));
}

function pageItem(
  block: ContentBlock,
  startOffset: number,
  endOffset: number,
  measuredHeight: number,
  availableHeight: number,
): PaginatedBlock {
  return {
    block,
    startOffset,
    endOffset,
    measuredHeight,
    oversized: measuredHeight > availableHeight,
  };
}

export function paginateMeasuredBlocks(
  blocks: ContentBlock[],
  measurements: BlockMeasurementMap,
  metrics: PaginationMetrics,
): MeasuredPage[] {
  if (metrics.availableHeight <= 0 || metrics.contentWidth <= 0) {
    return [{
      items: blocks
        .filter((block) => block.block_type !== "PAGE_BREAK")
        .map((block) =>
          pageItem(block, 0, block.text.length, 0, metrics.availableHeight),
        ),
      usedHeight: 0,
    }];
  }

  const pages: MeasuredPage[] = [];
  let items: PaginatedBlock[] = [];
  let usedHeight = 0;
  const commitPage = () => {
    if (items.length) pages.push({ items, usedHeight });
    items = [];
    usedHeight = 0;
  };
  const visibleBlocks = blocks.filter(
    (block) => block.metadata.suppressed !== true,
  );

  for (let index = 0; index < visibleBlocks.length; index += 1) {
    const block = visibleBlocks[index];
    if (block.block_type === "PAGE_BREAK") {
      commitPage();
      continue;
    }
    if (block.break_before && items.length) commitPage();
    const height = measurementHeight(block, measurements, metrics);
    const adjacent = visibleBlocks[index + 1];
    const next =
      adjacent && adjacent.block_type !== "PAGE_BREAK" ? adjacent : undefined;
    const nextHeight = next
      ? Math.min(
          measurementHeight(next, measurements, metrics),
          metrics.availableHeight,
        )
      : 0;
    const keepWithNext = block.keep_with_next && next !== undefined;
    if (
      items.length
      && (
        usedHeight + height > metrics.availableHeight
        || (keepWithNext && usedHeight + height + nextHeight > metrics.availableHeight)
      )
    ) {
      commitPage();
    }

    if (
      height <= metrics.availableHeight
      || !SPLITTABLE_TYPES.has(block.block_type)
    ) {
      items.push(
        pageItem(
          block,
          0,
          block.text.length,
          height,
          metrics.availableHeight,
        ),
      );
      usedHeight += Math.min(height, metrics.availableHeight);
      if (height > metrics.availableHeight || block.break_after) commitPage();
      continue;
    }

    const ranges = rangeMeasurements(block, measurements, metrics);
    let fragmentStart = ranges[0]?.startOffset ?? 0;
    let fragmentEnd = fragmentStart;
    let fragmentHeight = 0;
    const commitFragment = () => {
      if (fragmentEnd <= fragmentStart) return;
      items.push(
        pageItem(
          block,
          fragmentStart,
          fragmentEnd,
          fragmentHeight,
          metrics.availableHeight,
        ),
      );
      usedHeight += Math.min(fragmentHeight, metrics.availableHeight);
      fragmentStart = fragmentEnd;
      fragmentHeight = 0;
    };

    for (const range of ranges) {
      if (
        fragmentHeight > 0
        && usedHeight + fragmentHeight + range.height > metrics.availableHeight
      ) {
        commitFragment();
        commitPage();
      } else if (
        fragmentHeight === 0
        && items.length
        && usedHeight + range.height > metrics.availableHeight
      ) {
        commitPage();
      }
      if (fragmentHeight === 0) fragmentStart = range.startOffset;
      fragmentEnd = range.endOffset;
      fragmentHeight += range.height;
      if (fragmentHeight >= metrics.availableHeight) {
        commitFragment();
        commitPage();
      }
    }
    commitFragment();
    if (block.break_after) commitPage();
  }
  commitPage();
  return pages.length ? pages : [{ items: [], usedHeight: 0 }];
}

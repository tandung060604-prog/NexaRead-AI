"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ContentBlock, Highlight, KeywordOccurrence } from "@/lib/documents-api";
import {
  BlockMeasurementMap,
  createPaginationCacheKey,
  getCachedPageMap,
  paginateMeasuredBlocks,
  setCachedPageMap,
} from "@/lib/measured-pagination";
import type {
  MeasuredPage,
  PaginatedBlock,
} from "@/lib/measured-pagination";
import type { BlockSelection } from "./reader-block";

import { PageSpread } from "./page-spread";
import { PageTurnController } from "./page-turn-controller";
import { PaginationMeasurer } from "./pagination-measurer";

type BookReaderProps = {
  blocks: ContentBlock[];
  documentTitle: string;
  documentVersionId: string;
  contentRevision: string;
  pageColor: string;
  pageTextureOpacity: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  readingWidth: number;
  highlights: Map<string, Highlight[]>;
  keywords: Map<string, KeywordOccurrence[]>;
  bookmarks: Map<string, boolean>;
  highlightedBlock: string | null;
  highlightQuery: string;
  keywordsEnabled: boolean;
  onBookmark: (block: ContentBlock) => void;
  onSelection: (selection: BlockSelection) => void;
  onKeywordSelect: (occurrence: KeywordOccurrence) => void;
  animationEnabled: boolean;
  reducedMotion: boolean;
  onPageChange: (
    sourcePageNumber: number,
    blockId: string,
    readingPageNumber: number,
  ) => void;
  initialPage: number;
  initialBlockId: string | null;
  onPageTurnSound: () => void;
};

type ViewportSize = {
  width: number;
  height: number;
};

export type DisplayPage = {
  kind: "cover" | "title" | "content" | "blank";
  items: PaginatedBlock[];
  contentPageNumber: number | null;
  chapterTitle: string | null;
};

export function buildBookDisplayPages(
  contentPages: MeasuredPage[],
): DisplayPage[] {
  const result: DisplayPage[] = [
    {
      kind: "cover",
      items: [],
      contentPageNumber: null,
      chapterTitle: null,
    },
    {
      kind: "title",
      items: [],
      contentPageNumber: null,
      chapterTitle: null,
    },
  ];
  let currentChapter: string | null = null;
  contentPages.forEach((page, pageIndex) => {
    const opening = page.items[0]?.block;
    const beginsChapter = Boolean(
      opening?.is_chapter_opening || opening?.block_type === "HEADING_1",
    );
    if (beginsChapter && result.length % 2 === 0) {
      result.push({
        kind: "blank",
        items: [],
        contentPageNumber: null,
        chapterTitle: currentChapter,
      });
    }
    const openingTitle = beginsChapter
      ? opening?.display_text || opening?.text || null
      : null;
    if (openingTitle) currentChapter = openingTitle;
    result.push({
      kind: "content",
      items: page.items,
      contentPageNumber: pageIndex + 1,
      chapterTitle: currentChapter,
    });
    const lastChapterHeading = [...page.items]
      .reverse()
      .find(
        (item) =>
          item.block.block_type === "HEADING_1" ||
          item.block.heading_level === 1,
      );
    if (lastChapterHeading) {
      currentChapter =
        lastChapterHeading.block.display_text ||
        lastChapterHeading.block.text;
    }
  });
  return result;
}

function useReaderViewport(
  containerRef: React.RefObject<HTMLDivElement | null>,
): ViewportSize {
  const [viewport, setViewport] = useState<ViewportSize>({
    width: 768,
    height: 800,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const bounds = container.getBoundingClientRect();
      const width = bounds.width || window.innerWidth;
      const height = window.visualViewport?.height || window.innerHeight;
      setViewport((current) =>
        Math.round(current.width) === Math.round(width)
        && Math.round(current.height) === Math.round(height)
          ? current
          : { width, height },
      );
    };
    const debouncedUpdate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(update, 150);
    };
    update();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(debouncedUpdate);
    observer?.observe(container);
    window.addEventListener("resize", debouncedUpdate);
    window.visualViewport?.addEventListener("resize", debouncedUpdate);
    return () => {
      if (timer) clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("resize", debouncedUpdate);
      window.visualViewport?.removeEventListener("resize", debouncedUpdate);
    };
  }, [containerRef]);

  return viewport;
}

export function BookReader({
  blocks,
  documentTitle,
  documentVersionId,
  contentRevision,
  pageColor,
  pageTextureOpacity,
  fontFamily,
  fontSize,
  lineHeight,
  readingWidth,
  highlights,
  keywords,
  bookmarks,
  highlightedBlock,
  highlightQuery,
  keywordsEnabled,
  onBookmark,
  onSelection,
  onKeywordSelect,
  animationEnabled,
  reducedMotion,
  onPageChange,
  initialPage,
  initialBlockId,
  onPageTurnSound,
}: BookReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewport = useReaderViewport(containerRef);
  const twoPage = viewport.width >= 1024;
  const pagesPerSpread = twoPage ? 2 : 1;
  const pageWidth = twoPage
    ? Math.min(580, Math.max(320, (viewport.width - 72) / 2))
    : Math.min(600, Math.max(280, viewport.width - 32));
  const pageHeight = Math.max(
    380,
    Math.min(860, viewport.height - 180, pageWidth * 1.42),
  );
  const horizontalPadding = viewport.width >= 640 ? 80 : 48;
  const contentWidth = Math.max(
    220,
    Math.min(readingWidth, pageWidth - horizontalPadding),
  );
  const fitContextKey = useMemo(
    () =>
      JSON.stringify([
        contentRevision,
        documentVersionId,
        fontFamily,
        fontSize,
        lineHeight,
        readingWidth,
        twoPage,
        Math.round(viewport.height),
        Math.round(viewport.width),
      ]),
    [
      contentRevision,
      documentVersionId,
      fontFamily,
      fontSize,
      lineHeight,
      readingWidth,
      twoPage,
      viewport.height,
      viewport.width,
    ],
  );
  const [fitState, setFitState] = useState({
    contextKey: "",
    adjustment: 0,
  });
  const fitAdjustment =
    fitState.contextKey === fitContextKey ? fitState.adjustment : 0;
  const availableHeight = Math.max(220, pageHeight - 116 - fitAdjustment);
  const [measurements, setMeasurements] = useState<BlockMeasurementMap>(
    () => new Map(),
  );
  const [measurementFailed, setMeasurementFailed] = useState(false);
  const paginationKey = useMemo(
    () =>
      createPaginationCacheKey({
        documentVersionId,
        contentRevision,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        fontFamily,
        fontSize,
        lineHeight,
        readingWidth,
        readingMode: `${twoPage ? "book-spread" : "book-single"}:fit-${fitAdjustment}`,
      }),
    [
      contentRevision,
      documentVersionId,
      fitAdjustment,
      fontFamily,
      fontSize,
      lineHeight,
      readingWidth,
      twoPage,
      viewport.height,
      viewport.width,
    ],
  );
  const metrics = useMemo(
    () => ({
      availableHeight,
      contentWidth,
      fontSize,
      lineHeight,
    }),
    [availableHeight, contentWidth, fontSize, lineHeight],
  );
  const computedContentPages = useMemo(
    () => paginateMeasuredBlocks(blocks, measurements, metrics),
    [blocks, measurements, metrics],
  );
  const contentPages =
    measurements.size === 0
      ? getCachedPageMap(paginationKey) ?? computedContentPages
      : computedContentPages;

  useEffect(() => {
    setCachedPageMap(paginationKey, contentPages);
  }, [contentPages, paginationKey]);

  const displayPages = useMemo(
    () => buildBookDisplayPages(contentPages),
    [contentPages],
  );

  const handleMeasurements = useCallback(
    (next: BlockMeasurementMap, failed: boolean) => {
      setMeasurementFailed(failed);
      setMeasurements(next);
    },
    [],
  );

  const handlePageOverflow = useCallback(
    (_pageNumber: number, overflowPixels: number) => {
      setFitState((current) => ({
        contextKey: fitContextKey,
        adjustment: Math.min(
          200,
          (current.contextKey === fitContextKey ? current.adjustment : 0)
            + Math.ceil(overflowPixels)
            + 8,
        ),
      }));
    },
    [fitContextKey],
  );

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const initialPageApplied = useRef(false);
  const anchorBlockId = useRef<string | null>(null);

  useEffect(() => {
    if (initialPageApplied.current) return;
    initialPageApplied.current = true;
    const sourcePage = initialPage + 1;
    const restoredIndex = displayPages.findIndex((page) =>
      page.items.some((item) =>
        initialBlockId
          ? item.block.id === initialBlockId
          : item.block.page_number >= sourcePage
      ),
    );
    const index = restoredIndex >= 0 ? restoredIndex : 0;
    anchorBlockId.current = initialBlockId;
    setCurrentPageIndex(twoPage ? Math.floor(index / 2) * 2 : index);
  }, [displayPages, initialBlockId, initialPage, twoPage]);

  useEffect(() => {
    const anchor = anchorBlockId.current;
    if (anchor) {
      const anchorPage = displayPages.findIndex((page) =>
        page.items.some((item) => item.block.id === anchor),
      );
      if (anchorPage >= 0) {
        setCurrentPageIndex(
          twoPage ? Math.floor(anchorPage / 2) * 2 : anchorPage,
        );
        return;
      }
    }
    setCurrentPageIndex((current) =>
      Math.min(
        twoPage ? Math.floor(current / 2) * 2 : current,
        Math.max(0, displayPages.length - 1),
      ),
    );
  }, [displayPages, twoPage]);

  const style = useMemo(
    () => ({ fontFamily, fontSize, lineHeight, readingWidth }),
    [fontFamily, fontSize, lineHeight, readingWidth],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      const clamped = Math.max(
        0,
        Math.min(newPage, displayPages.length - 1),
      );
      if (clamped === currentPageIndex) return;
      setDirection(clamped > currentPageIndex ? 1 : -1);
      setCurrentPageIndex(clamped);
      onPageTurnSound();
      const firstItem = displayPages[clamped]?.items[0];
      if (firstItem) {
        anchorBlockId.current = firstItem.block.id;
        onPageChange(
          firstItem.block.source_page_number || firstItem.block.page_number,
          firstItem.block.id,
          clamped + 1,
        );
      }
    },
    [
      currentPageIndex,
      onPageChange,
      onPageTurnSound,
      displayPages,
    ],
  );

  const leftPage = displayPages[currentPageIndex];
  const rightPage = twoPage ? displayPages[currentPageIndex + 1] : undefined;
  const leftBlocks = leftPage?.items ?? [];
  const rightBlocks = rightPage?.items ?? [];

  return (
    <div
      className="overflow-hidden px-4 py-6"
      data-measurement-fallback={measurementFailed || undefined}
      ref={containerRef}
    >
      <PaginationMeasurer
        availableHeight={availableHeight}
        blocks={blocks}
        contentWidth={contentWidth}
        fontFamily={fontFamily}
        fontSize={fontSize}
        lineHeight={lineHeight}
        measurementKey={paginationKey}
        onMeasure={handleMeasurements}
      />
      <PageTurnController
        animationEnabled={animationEnabled}
        currentPage={currentPageIndex}
        keyboardActive={true}
        onPageChange={handlePageChange}
        pagesPerSpread={pagesPerSpread}
        reducedMotion={reducedMotion}
        totalPages={displayPages.length}
      >
        <PageSpread
          animationClass=""
          animationEnabled={animationEnabled && !reducedMotion}
          animatingSide="none"
          bookmarks={bookmarks}
          direction={direction}
          highlightQuery={highlightQuery}
          highlightedBlock={highlightedBlock}
          highlights={highlights}
          keywords={keywords}
          keywordsEnabled={keywordsEnabled}
          leftBlocks={leftBlocks}
          leftChapterTitle={leftPage?.chapterTitle}
          leftPageKind={leftPage?.kind ?? "blank"}
          leftPageNumber={leftPage?.contentPageNumber ?? null}
          documentTitle={documentTitle}
          onBookmark={onBookmark}
          onKeywordSelect={onKeywordSelect}
          onPageOverflow={handlePageOverflow}
          onSelection={onSelection}
          pageColor={pageColor}
          pageHeight={pageHeight}
          pageTextureOpacity={pageTextureOpacity}
          rightBlocks={rightBlocks}
          rightChapterTitle={rightPage?.chapterTitle}
          rightPageExists={Boolean(rightPage)}
          rightPageKind={rightPage?.kind ?? "blank"}
          rightPageNumber={rightPage?.contentPageNumber ?? null}
          style={style}
          twoPage={twoPage}
        />
      </PageTurnController>

      <div
        className="mx-auto mt-4 max-w-[600px] bg-[var(--reader-surface-muted)]"
        style={{ borderRadius: "2px", height: "3px" }}
      >
        <div
          className="reading-progress-bar"
          style={{
            width: `${
              displayPages.length
                ? ((currentPageIndex + 1) / displayPages.length) * 100
                : 0
            }%`,
          }}
        />
      </div>
    </div>
  );
}

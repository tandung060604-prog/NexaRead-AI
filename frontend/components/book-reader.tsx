"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ContentBlock, Highlight, KeywordOccurrence } from "@/lib/documents-api";
import type { BlockSelection } from "./reader-block";

import { PageSpread } from "./page-spread";
import { PageTurnController } from "./page-turn-controller";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BookReaderProps = {
  /** All visible (non-suppressed) blocks, in reading order. */
  blocks: ContentBlock[];
  /** Room page color. */
  pageColor: string;
  /** Room page texture opacity. */
  pageTextureOpacity: number;
  /** Typography styles. */
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  readingWidth: number;
  /** Reader state props forwarded to ReaderBlock. */
  highlights: Map<string, Highlight[]>;
  keywords: Map<string, KeywordOccurrence[]>;
  bookmarks: Map<string, boolean>;
  highlightedBlock: string | null;
  highlightQuery: string;
  keywordsEnabled: boolean;
  onBookmark: (block: ContentBlock) => void;
  onSelection: (selection: BlockSelection) => void;
  onKeywordSelect: (occurrence: KeywordOccurrence) => void;
  /** Page-turn animation enabled. */
  animationEnabled: boolean;
  /** User prefers reduced motion. */
  reducedMotion: boolean;
  /** Callback when page changes — for progress tracking. */
  onPageChange: (pageNumber: number, blockId: string) => void;
  /** Initial page to restore (0-based index). */
  initialPage: number;
  /** Callback to play page turn sound. */
  onPageTurnSound: () => void;
};

// ---------------------------------------------------------------------------
// Pagination helpers
// ---------------------------------------------------------------------------

/** How many content blocks to fit per "page" in book mode. */
const BLOCKS_PER_PAGE = 8;

function paginateBlocks(blocks: ContentBlock[]): ContentBlock[][] {
  if (blocks.length === 0) return [[]];

  const pages: ContentBlock[][] = [];
  let current: ContentBlock[] = [];

  for (const block of blocks) {
    // Start a new page at PAGE_BREAK blocks
    if (block.block_type === "PAGE_BREAK") {
      if (current.length > 0) {
        pages.push(current);
        current = [];
      }
      continue;
    }

    current.push(block);

    // Split when page is full
    if (current.length >= BLOCKS_PER_PAGE) {
      pages.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    pages.push(current);
  }

  return pages.length > 0 ? pages : [[]];
}

// ---------------------------------------------------------------------------
// Hook: Responsive page count
// ---------------------------------------------------------------------------

function useTwoPageLayout(): boolean {
  const [twoPage, setTwoPage] = useState(false);

  useEffect(() => {
    function check() {
      setTwoPage(window.innerWidth >= 1024);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return twoPage;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookReader({
  blocks,
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
  onPageTurnSound,
}: BookReaderProps) {
  const pages = useMemo(() => paginateBlocks(blocks), [blocks]);
  const twoPage = useTwoPageLayout();
  const pagesPerSpread = twoPage ? 2 : 1;
  const [currentPageIndex, setCurrentPageIndex] = useState(() =>
    Math.min(initialPage, Math.max(0, pages.length - 1)),
  );
  const initialPageApplied = useRef(false);

  // Sync initial page only once
  useEffect(() => {
    if (initialPageApplied.current) return;
    initialPageApplied.current = true;
    const targetPage = Math.min(initialPage, Math.max(0, pages.length - 1));
    setCurrentPageIndex(targetPage);
  }, [initialPage, pages.length]);

  const style = useMemo(
    () => ({ fontFamily, fontSize, lineHeight, readingWidth }),
    [fontFamily, fontSize, lineHeight, readingWidth],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      const clamped = Math.max(0, Math.min(newPage, pages.length - 1));
      setCurrentPageIndex(clamped);

      // Play sound
      onPageTurnSound();

      // Report progress
      const pageBlocks = pages[clamped];
      if (pageBlocks && pageBlocks.length > 0) {
        onPageChange(pageBlocks[0].page_number, pageBlocks[0].id);
      }
    },
    [pages, onPageChange, onPageTurnSound],
  );

  // Blocks for current spread
  const leftBlocks = pages[currentPageIndex] ?? [];
  const rightBlocks = twoPage ? (pages[currentPageIndex + 1] ?? []) : [];

  return (
    <div className="px-4 py-6">
      <PageTurnController
        animationEnabled={animationEnabled}
        currentPage={currentPageIndex}
        keyboardActive={true}
        onPageChange={handlePageChange}
        pagesPerSpread={pagesPerSpread}
        reducedMotion={reducedMotion}
        totalPages={pages.length}
      >
        <PageSpread
          animatingSide="none"
          animationClass=""
          bookmarks={bookmarks}
          highlightQuery={highlightQuery}
          highlightedBlock={highlightedBlock}
          highlights={highlights}
          keywordsEnabled={keywordsEnabled}
          keywords={keywords}
          leftBlocks={leftBlocks}
          leftPageNumber={currentPageIndex + 1}
          onBookmark={onBookmark}
          onKeywordSelect={onKeywordSelect}
          onSelection={onSelection}
          pageColor={pageColor}
          pageTextureOpacity={pageTextureOpacity}
          rightBlocks={rightBlocks}
          rightPageNumber={currentPageIndex + 2}
          style={style}
          totalPages={pages.length}
          twoPage={twoPage}
        />
      </PageTurnController>

      {/* Reading progress bar */}
      <div className="mx-auto mt-4 max-w-[600px] bg-[var(--reader-surface-muted)]" style={{ height: "3px", borderRadius: "2px" }}>
        <div
          className="reading-progress-bar"
          style={{ width: `${pages.length > 0 ? ((currentPageIndex + 1) / pages.length) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

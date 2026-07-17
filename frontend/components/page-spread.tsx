"use client";

import type { ContentBlock, Highlight, KeywordOccurrence } from "@/lib/documents-api";
import type { BlockSelection } from "./reader-block";

import { BookPage } from "./book-page";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageSpreadProps = {
  /** Left page blocks (empty array if this is page 1 in a pair). */
  leftBlocks: ContentBlock[];
  /** Right page blocks. */
  rightBlocks: ContentBlock[];
  /** Left page number. */
  leftPageNumber: number;
  /** Right page number (may exceed total pages for the last page). */
  rightPageNumber: number;
  /** Whether to show two pages (desktop) or one (mobile/narrow). */
  twoPage: boolean;
  /** Page color from room config. */
  pageColor: string;
  /** Page texture opacity from room config. */
  pageTextureOpacity: number;
  /** Typography styles. */
  style: {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    readingWidth: number;
  };
  /** Animation class applied to the page being turned. */
  animationClass: string;
  /** Which page (left/right) is being animated. "none" means no animation. */
  animatingSide: "left" | "right" | "none";
  /** Total number of content pages. */
  totalPages: number;
  /** Reader block props. */
  highlights: Map<string, Highlight[]>;
  keywords: Map<string, KeywordOccurrence[]>;
  bookmarks: Map<string, boolean>;
  highlightedBlock: string | null;
  highlightQuery: string;
  keywordsEnabled: boolean;
  onBookmark: (block: ContentBlock) => void;
  onSelection: (selection: BlockSelection) => void;
  onKeywordSelect: (occurrence: KeywordOccurrence) => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PageSpread({
  leftBlocks,
  rightBlocks,
  leftPageNumber,
  rightPageNumber,
  twoPage,
  pageColor,
  pageTextureOpacity,
  style,
  animationClass,
  animatingSide,
  totalPages,
  highlights,
  keywords,
  bookmarks,
  highlightedBlock,
  highlightQuery,
  keywordsEnabled,
  onBookmark,
  onSelection,
  onKeywordSelect,
}: PageSpreadProps) {
  const sharedProps = {
    pageColor,
    pageTextureOpacity,
    style,
    highlights,
    keywords,
    bookmarks,
    highlightedBlock,
    highlightQuery,
    keywordsEnabled,
    onBookmark,
    onSelection,
    onKeywordSelect,
  };

  if (!twoPage) {
    // Mobile / narrow: single page
    return (
      <div className="mx-auto w-full max-w-[600px]">
        <BookPage
          {...sharedProps}
          animationClass={animationClass}
          blocks={leftBlocks}
          pageNumber={leftPageNumber}
          position="single"
        />
      </div>
    );
  }

  // Desktop: two-page spread
  const showRight = rightPageNumber <= totalPages;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] items-stretch justify-center">
      {/* Left page */}
      <div className="w-1/2 max-w-[580px]">
        <BookPage
          {...sharedProps}
          animationClass={animatingSide === "left" ? animationClass : ""}
          blocks={leftBlocks}
          pageNumber={leftPageNumber}
          position="left"
        />
      </div>

      {/* Book spine */}
      <div className="book-spine" />

      {/* Right page */}
      <div className="w-1/2 max-w-[580px]">
        {showRight ? (
          <BookPage
            {...sharedProps}
            animationClass={animatingSide === "right" ? animationClass : ""}
            blocks={rightBlocks}
            pageNumber={rightPageNumber}
            position="right"
          />
        ) : (
          <div
            className="book-page flex min-h-[70vh] items-center justify-center"
            style={{
              borderRadius: "0 4px 4px 0",
              "--room-page-color": pageColor,
            } as Record<string, string>}
          >
            <p className="text-sm text-[var(--reader-muted)]">End of document</p>
          </div>
        )}
      </div>
    </div>
  );
}

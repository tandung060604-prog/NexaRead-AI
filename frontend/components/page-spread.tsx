"use client";

import type { ContentBlock, Highlight, KeywordOccurrence } from "@/lib/documents-api";
import type { PaginatedBlock } from "@/lib/measured-pagination";
import type { BlockSelection } from "./reader-block";
import { motion } from "framer-motion";

import { useI18n } from "@/components/i18n-provider";

import { BookPage } from "./book-page";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageSpreadProps = {
  /** The direction of the page turn (1 for next, -1 for prev). */
  direction?: number;
  /** Whether the animation should play. */
  animationEnabled?: boolean;
  /** Left page blocks (empty array if this is page 1 in a pair). */
  leftBlocks: PaginatedBlock[];
  /** Right page blocks. */
  rightBlocks: PaginatedBlock[];
  /** Left page number. */
  leftPageNumber: number | null;
  /** Right page number (may exceed total pages for the last page). */
  rightPageNumber: number | null;
  leftPageKind: "cover" | "title" | "content" | "blank";
  rightPageKind: "cover" | "title" | "content" | "blank";
  rightPageExists: boolean;
  leftChapterTitle?: string | null;
  rightChapterTitle?: string | null;
  documentTitle: string;
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
  pageHeight: number;
  /** Animation class applied to the page being turned. */
  animationClass: string;
  /** Which page (left/right) is being animated. "none" means no animation. */
  animatingSide: "left" | "right" | "none";
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
  onPageOverflow?: (pageNumber: number, overflowPixels: number) => void;
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
  pageHeight,
  animationClass,
  animatingSide,
  highlights,
  keywords,
  bookmarks,
  highlightedBlock,
  highlightQuery,
  keywordsEnabled,
  onBookmark,
  onSelection,
  onKeywordSelect,
  onPageOverflow,
  animationEnabled,
  direction,
  leftPageKind,
  rightPageKind,
  leftChapterTitle,
  rightChapterTitle,
  documentTitle,
  rightPageExists,
}: PageSpreadProps) {
  const { t } = useI18n();
  const sharedProps = {
    pageColor,
    pageTextureOpacity,
    style,
    pageHeight,
    highlights,
    keywords,
    bookmarks,
    highlightedBlock,
    highlightQuery,
    keywordsEnabled,
    onBookmark,
    onSelection,
    onKeywordSelect,
    onOverflow: onPageOverflow,
  };

  if (!twoPage) {
    // Mobile / narrow: single page
    return (
      <div className="mx-auto w-full max-w-[600px]">
        <BookPage
          {...sharedProps}
          animationClass={animationClass}
          blocks={leftBlocks}
          chapterTitle={leftChapterTitle}
          documentTitle={documentTitle}
          pageKind={leftPageKind}
          pageNumber={leftPageNumber}
          position="single"
        />
      </div>
    );
  }

  // Desktop: two-page spread
  const showRight = rightPageExists;

  // Realistic page flip animations
  // When going next (direction = 1), the new left page flips in from the right.
  // When going prev (direction = -1), the new right page flips in from the left.
  const isAnimatingLeft = animationEnabled && direction === 1;
  const isAnimatingRight = animationEnabled && direction === -1;

  const leftVariants = {
    initial: { rotateY: 90, opacity: 0, filter: "brightness(0.7)", zIndex: 10 },
    animate: { rotateY: 0, opacity: 1, filter: "brightness(1)", zIndex: 10 },
  };

  const rightVariants = {
    initial: { rotateY: -90, opacity: 0, filter: "brightness(0.7)", zIndex: 10 },
    animate: { rotateY: 0, opacity: 1, filter: "brightness(1)", zIndex: 10 },
  };

  return (
    <div className="mx-auto flex w-full max-w-[1200px] items-stretch justify-center relative shadow-[0_30px_60px_rgba(0,0,0,0.4)] rounded-md perspective-[2500px]">
      {/* Book Underlay / Cover Base */}
      <div className="absolute inset-0 -bottom-2 -top-2 -left-3 -right-3 -z-10 rounded-lg bg-[var(--surface-muted)] shadow-xl hidden lg:block" />

      {/* Left page */}
      <motion.div
        key={`left-${leftPageKind}-${leftPageNumber ?? "front"}`}
        className="w-1/2 max-w-[580px] relative z-10 origin-right"
        initial={isAnimatingLeft ? "initial" : false}
        animate="animate"
        variants={isAnimatingLeft ? leftVariants : undefined}
        transition={{ type: "tween", duration: 0.5, ease: "easeOut" }}
      >
        <BookPage
          {...sharedProps}
          animationClass={animatingSide === "left" ? animationClass : ""}
          blocks={leftBlocks}
          chapterTitle={leftChapterTitle}
          documentTitle={documentTitle}
          pageKind={leftPageKind}
          pageNumber={leftPageNumber}
          position="left"
        />
        {/* Shadow cast by spine onto left page */}
        <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/20 to-transparent pointer-events-none" />
      </motion.div>

      {/* Book spine */}
      <div className="w-[4px] sm:w-[8px] bg-gradient-to-r from-black/40 via-white/20 to-black/40 z-20 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]" />

      {/* Right page */}
      <motion.div
        key={`right-${rightPageKind}-${rightPageNumber ?? "front"}`}
        className="w-1/2 max-w-[580px] relative z-10 origin-left"
        initial={isAnimatingRight ? "initial" : false}
        animate="animate"
        variants={isAnimatingRight ? rightVariants : undefined}
        transition={{ type: "tween", duration: 0.5, ease: "easeOut" }}
      >
        {/* Shadow cast by spine onto right page */}
        <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/20 to-transparent pointer-events-none z-10" />

        {showRight ? (
          <BookPage
            {...sharedProps}
            animationClass={animatingSide === "right" ? animationClass : ""}
            blocks={rightBlocks}
            chapterTitle={rightChapterTitle}
            documentTitle={documentTitle}
            pageKind={rightPageKind}
            pageNumber={rightPageNumber}
            position="right"
          />
        ) : (
          <div
            className="book-page flex h-full items-center justify-center"
            style={{
              borderRadius: "0 4px 4px 0",
              height: `${pageHeight}px`,
              "--room-page-color": pageColor,
            } as Record<string, string>}
          >
            <p className="text-sm text-[var(--reader-muted)]">
              {t("reader", "endDocument")}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

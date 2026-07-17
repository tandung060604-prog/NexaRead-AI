"use client";

import { ReactNode, useMemo } from "react";

import type { ContentBlock, Highlight, KeywordOccurrence } from "@/lib/documents-api";

import { BlockSelection, ReaderBlock } from "./reader-block";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookPageProps = {
  /** The content blocks to render on this page. */
  blocks: ContentBlock[];
  /** Page number (1-indexed). */
  pageNumber: number;
  /** Which side in a two-page spread: left, right, or single. */
  position: "left" | "right" | "single";
  /** CSS page color from room config. */
  pageColor: string;
  /** CSS page texture opacity from room config. */
  pageTextureOpacity: number;
  /** Reading typography styles. */
  style: {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    readingWidth: number;
  };
  /** CSS class for page-turn animation state. */
  animationClass: string;
  /** Existing reader props forwarded to ReaderBlock. */
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

export function BookPage({
  blocks,
  pageNumber,
  position,
  pageColor,
  pageTextureOpacity,
  style,
  animationClass,
  highlights,
  keywords,
  bookmarks,
  highlightedBlock,
  highlightQuery,
  keywordsEnabled,
  onBookmark,
  onSelection,
  onKeywordSelect,
}: BookPageProps) {
  const roomStyles = useMemo(
    () => ({
      "--room-page-color": pageColor,
      "--room-page-texture-opacity": String(pageTextureOpacity),
    } as Record<string, string>),
    [pageColor, pageTextureOpacity],
  );

  const borderRadius = position === "left"
    ? "4px 0 0 4px"
    : position === "right"
      ? "0 4px 4px 0"
      : "4px";

  return (
    <div
      className={`book-page flex flex-col ${animationClass}`}
      data-page={pageNumber}
      style={{
        ...roomStyles,
        borderRadius,
        minHeight: "70vh",
        maxHeight: "85vh",
        overflow: "hidden",
      }}
    >
      {/* Page content area */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-6 py-8 sm:px-10"
        style={{
          fontFamily: style.fontFamily,
          fontSize: `${style.fontSize}px`,
          lineHeight: style.lineHeight,
          maxWidth: `${Math.min(style.readingWidth, 600)}px`,
          marginLeft: "auto",
          marginRight: "auto",
          width: "100%",
        }}
      >
        {blocks.length === 0 ? (
          <EmptyPage />
        ) : (
          blocks.map((block) => (
            <ReaderBlock
              block={block}
              bookmarked={bookmarks.has(block.id)}
              highlighted={highlightedBlock === block.id}
              highlights={highlights.get(block.id) ?? []}
              key={block.id}
              keywords={keywordsEnabled ? keywords.get(block.id) ?? [] : []}
              onBookmark={onBookmark}
              onKeywordSelect={onKeywordSelect}
              onSelection={onSelection}
              query={highlightQuery}
            />
          ))
        )}
      </div>

      {/* Page footer with page number */}
      <div className="flex-shrink-0 pb-4 pt-2 text-center">
        <span className="text-xs text-[var(--reader-muted)]">{pageNumber}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function EmptyPage(): ReactNode {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-[var(--reader-muted)]">—</p>
    </div>
  );
}

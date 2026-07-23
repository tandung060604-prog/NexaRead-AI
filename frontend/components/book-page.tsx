"use client";

import { ReactNode, useLayoutEffect, useMemo, useRef } from "react";

import type { ContentBlock, Highlight, KeywordOccurrence } from "@/lib/documents-api";
import type { PaginatedBlock } from "@/lib/measured-pagination";
import { useI18n } from "@/components/i18n-provider";

import { BlockSelection, ReaderBlock } from "./reader-block";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookPageProps = {
  /** The content blocks to render on this page. */
  blocks: PaginatedBlock[];
  /** Page number (1-indexed). */
  pageNumber: number | null;
  pageKind?: "cover" | "title" | "content" | "blank";
  documentTitle?: string;
  chapterTitle?: string | null;
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
  pageHeight: number;
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
  onOverflow?: (pageNumber: number, overflowPixels: number) => void;
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
  pageHeight,
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
  onOverflow,
  pageKind = "content",
  documentTitle = "",
  chapterTitle = null,
}: BookPageProps) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement>(null);
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

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !onOverflow || pageKind !== "content" || pageNumber === null) return;
    const frame = requestAnimationFrame(() => {
      const overflowPixels = content.scrollHeight - content.clientHeight;
      if (overflowPixels > 1) onOverflow(pageNumber, overflowPixels);
    });
    return () => cancelAnimationFrame(frame);
  }, [blocks, onOverflow, pageHeight, pageKind, pageNumber, style]);

  const isChapterOpening =
    pageKind === "content" &&
    Boolean(
      blocks[0]?.block.is_chapter_opening ||
        blocks[0]?.block.block_type === "HEADING_1",
    );
  const pageLabel =
    pageKind === "cover"
      ? t("reader", "bookCover")
      : pageKind === "title"
        ? t("reader", "bookTitlePage")
        : pageKind === "blank"
          ? t("reader", "bookBlankPage")
          : t("reader", "bookPageLabel", { page: pageNumber ?? "" });

  return (
    <div
      className={`book-page flex flex-col ${animationClass}`}
      aria-label={pageLabel}
      data-chapter-opening={isChapterOpening || undefined}
      data-page={pageNumber ?? undefined}
      data-page-kind={pageKind}
      role="group"
      style={{
        ...roomStyles,
        borderRadius,
        height: `${pageHeight}px`,
        overflow: "hidden",
      }}
    >
      {pageKind === "cover" ? (
        <div className="book-cover flex min-h-0 flex-1 items-center justify-center px-10 text-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] opacity-70">
              NexaRead
            </p>
            <h2 className="mt-8 text-3xl font-semibold leading-tight sm:text-4xl">
              {documentTitle}
            </h2>
          </div>
        </div>
      ) : pageKind === "title" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-10 text-center">
          <div className="max-w-sm">
            <h2 className="text-2xl font-semibold leading-tight sm:text-3xl">
              {documentTitle}
            </h2>
            <div className="mx-auto mt-8 h-px w-16 bg-current opacity-30" />
            <p className="mt-6 text-xs uppercase tracking-[0.2em] opacity-60">
              {t("reader", "bookEdition")}
            </p>
          </div>
        </div>
      ) : pageKind === "blank" ? (
        <div aria-hidden="true" className="min-h-0 flex-1" />
      ) : (
        <div
          className={`min-h-0 flex-1 overflow-hidden px-6 sm:px-10 ${
            isChapterOpening ? "pb-8 pt-14 sm:pt-20" : "py-8"
          }`}
          data-book-page-content="true"
          ref={contentRef}
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
          {chapterTitle && !isChapterOpening ? (
            <p className="mb-5 truncate text-center text-[0.68em] uppercase tracking-[0.16em] opacity-55">
              {chapterTitle}
            </p>
          ) : null}
          {blocks.length === 0 ? (
            <EmptyPage />
          ) : blocks.map((item) => {
            const availableHeight = Math.max(1, pageHeight - 116);
            const scale =
              item.oversized && item.measuredHeight > 0
                ? Math.min(1, availableHeight / item.measuredHeight)
                : 1;
            return (
              <div
                data-oversized-fit={item.oversized || undefined}
                key={`${item.block.id}:${item.startOffset}:${item.endOffset}`}
                style={{
                  height:
                    scale < 1
                      ? `${item.measuredHeight * scale}px`
                      : undefined,
                  overflow: "visible",
                }}
              >
                <div
                  style={{
                    transform: scale < 1 ? `scale(${scale})` : undefined,
                    transformOrigin: "top left",
                    width: scale < 1 ? `${100 / scale}%` : undefined,
                  }}
                >
                  <ReaderBlock
                    block={item.block}
                    bookmarked={bookmarks.has(item.block.id)}
                    highlighted={highlightedBlock === item.block.id}
                    highlights={highlights.get(item.block.id) ?? []}
                    keywords={
                      keywordsEnabled ? keywords.get(item.block.id) ?? [] : []
                    }
                    onBookmark={onBookmark}
                    onKeywordSelect={onKeywordSelect}
                    onSelection={onSelection}
                    query={highlightQuery}
                    rangeEnd={item.endOffset}
                    rangeStart={item.startOffset}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Page footer with page number */}
      {pageKind === "content" && pageNumber !== null ? (
      <div className="flex-shrink-0 pb-4 pt-2 text-center" aria-hidden="true">
        <span className="text-xs text-[var(--reader-muted)]">{pageNumber}</span>
      </div>
      ) : null}
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

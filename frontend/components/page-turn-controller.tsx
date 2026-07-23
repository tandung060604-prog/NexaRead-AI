"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/components/i18n-provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TurnDirection = "forward" | "backward";

type PageTurnControllerProps = {
  /** Current page index (0-based). */
  currentPage: number;
  /** Total number of pages. */
  totalPages: number;
  /** Number of pages shown at once (1 for mobile, 2 for desktop spread). */
  pagesPerSpread: number;
  /** Whether page-turn animation is enabled. */
  animationEnabled: boolean;
  /** Whether the user has enabled reduced motion. */
  reducedMotion: boolean;
  /** Callback when the page should change. */
  onPageChange: (newPage: number, direction: TurnDirection) => void;
  /** Whether keyboard input is active (disabled when typing in inputs). */
  keyboardActive: boolean;
  /** Children to render (the page spread). */
  children: React.ReactNode;
};

// ---------------------------------------------------------------------------
// Hook: Swipe detection
// ---------------------------------------------------------------------------

function useSwipe(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  enabled: boolean,
) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
    touchStartY.current = event.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      if (!enabled) return;
      const dx = event.changedTouches[0].clientX - touchStartX.current;
      const dy = event.changedTouches[0].clientY - touchStartY.current;

      // Only trigger if horizontal movement is dominant and > threshold
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
      }
    },
    [enabled, onSwipeLeft, onSwipeRight],
  );

  return { handleTouchStart, handleTouchEnd };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PageTurnController({
  currentPage,
  totalPages,
  pagesPerSpread,
  animationEnabled,
  reducedMotion,
  onPageChange,
  keyboardActive,
  children,
}: PageTurnControllerProps) {
  const { t } = useI18n();
  const [animating, setAnimating] = useState(false);
  const animationTimerRef = useRef<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const canGoForward = currentPage + pagesPerSpread < totalPages;
  const canGoBackward = currentPage > 0;

  const goForward = useCallback(() => {
    if (!canGoForward || animating) return;

    if (animationEnabled && !reducedMotion) {
      setAnimating(true);
      animationTimerRef.current = window.setTimeout(() => {
        setAnimating(false);
        onPageChange(currentPage + pagesPerSpread, "forward");
      }, 450);
    } else {
      onPageChange(currentPage + pagesPerSpread, "forward");
    }
  }, [canGoForward, animating, animationEnabled, reducedMotion, onPageChange, currentPage, pagesPerSpread]);

  const goBackward = useCallback(() => {
    if (!canGoBackward || animating) return;

    if (animationEnabled && !reducedMotion) {
      setAnimating(true);
      animationTimerRef.current = window.setTimeout(() => {
        setAnimating(false);
        onPageChange(Math.max(0, currentPage - pagesPerSpread), "backward");
      }, 450);
    } else {
      onPageChange(Math.max(0, currentPage - pagesPerSpread), "backward");
    }
  }, [canGoBackward, animating, animationEnabled, reducedMotion, onPageChange, currentPage, pagesPerSpread]);

  // Keyboard navigation
  useEffect(() => {
    if (!keyboardActive) return;

    function handleKeyDown(event: KeyboardEvent) {
      // Don't intercept when user is typing
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          event.preventDefault();
          goForward();
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          goBackward();
          break;
        case "Home":
          event.preventDefault();
          if (currentPage > 0) onPageChange(0, "backward");
          break;
        case "End": {
          event.preventDefault();
          const lastPage = Math.floor((totalPages - 1) / pagesPerSpread)
            * pagesPerSpread;
          if (lastPage !== currentPage) onPageChange(lastPage, "forward");
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentPage,
    goBackward,
    goForward,
    keyboardActive,
    onPageChange,
    pagesPerSpread,
    totalPages,
  ]);

  // Cleanup animation timer
  useEffect(() => {
    return () => {
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    };
  }, []);

  // Swipe support
  const { handleTouchStart, handleTouchEnd } = useSwipe(
    goForward,
    goBackward,
    true,
  );

  // Click on edges to navigate
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      // Don't navigate if clicking on interactive elements
      const target = event.target as HTMLElement;
      if (target.closest("button, a, input, textarea, [role='button']")) return;

      const rect = container.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const threshold = rect.width * 0.15;

      if (clickX < threshold) {
        goBackward();
      } else if (clickX > rect.width - threshold) {
        goForward();
      }
    },
    [goForward, goBackward],
  );

  return (
    <div
      className="relative select-none"
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
      ref={containerRef}
      role="region"
      aria-label={t("reader", "bookRegion")}
      aria-keyshortcuts="ArrowLeft ArrowRight PageUp PageDown Home End"
      aria-roledescription={t("reader", "bookRole")}
    >
      {children}

      {/* Navigation hint overlays (visible on hover) */}
      {canGoBackward && (
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 top-0 w-[15%] cursor-w-resize opacity-0 transition-opacity hover:opacity-100"
        >
          <div className="flex h-full items-center justify-center">
            <span className="rounded-full bg-black/20 px-3 py-2 text-sm text-white">‹</span>
          </div>
        </div>
      )}
      {canGoForward && (
        <div
          aria-hidden="true"
          className="absolute bottom-0 right-0 top-0 w-[15%] cursor-e-resize opacity-0 transition-opacity hover:opacity-100"
        >
          <div className="flex h-full items-center justify-center">
            <span className="rounded-full bg-black/20 px-3 py-2 text-sm text-white">›</span>
          </div>
        </div>
      )}

      {/* Accessible navigation buttons */}
      <div className="mt-4 flex items-center justify-center gap-6">
        <button
          aria-label={t("reader", "previousPage")}
          className="grid size-11 place-items-center rounded-full border border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-accent)] focus-visible:ring-offset-2 disabled:opacity-30"
          disabled={!canGoBackward || animating}
          onClick={(event) => { event.stopPropagation(); goBackward(); }}
          type="button"
        >
          ‹
        </button>
        <span aria-live="polite" className="text-sm text-[var(--reader-muted)]">
          {t("reader", "pageRange", {
            current: pagesPerSpread > 1 && currentPage + 2 <= totalPages
              ? `${currentPage + 1}–${currentPage + 2}`
              : currentPage + 1,
            total: totalPages,
          })}
        </span>
        <button
          aria-label={t("reader", "nextPage")}
          className="grid size-11 place-items-center rounded-full border border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-accent)] focus-visible:ring-offset-2 disabled:opacity-30"
          disabled={!canGoForward || animating}
          onClick={(event) => { event.stopPropagation(); goForward(); }}
          type="button"
        >
          ›
        </button>
      </div>
    </div>
  );
}

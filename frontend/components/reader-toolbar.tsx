"use client";

import {
  BookOpen,
  Focus,
  GraduationCap,
  Home,
  Maximize,
  Minimize,
  Scroll,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/components/i18n-provider";

import { useReadingRoom } from "./reading-room-provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReaderToolbarProps = {
  /** Document title. */
  title: string;
  /** Link back to document detail. */
  backHref: string;
  /** Current page / total pages. */
  activePage: number;
  readingPage?: number;
  chapterTitle?: string | null;
  pageCount: number | null;
  /** Progress save state. */
  progressState: "idle" | "saving" | "saved" | "failed";
  /** Extra toolbar content (settings, etc). */
  children?: ReactNode;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReaderToolbar({
  title,
  backHref,
  activePage,
  readingPage = activePage,
  chapterTitle,
  pageCount,
  progressState,
  children,
}: ReaderToolbarProps) {
  const { readingMode, setReadingMode, preferences, updatePreferences } =
    useReadingRoom();
  const { t } = useI18n();
  const [hidden, setHidden] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lastScrollY = useRef(0);
  const hideTimer = useRef<number | undefined>(undefined);

  // Auto-hide on scroll down in non-focus mode
  useEffect(() => {
    function handleScroll() {
      const currentY = window.scrollY;
      if (currentY > lastScrollY.current + 20 && currentY > 80) {
        setHidden(true);
      } else if (currentY < lastScrollY.current - 10) {
        setHidden(false);
      }
      lastScrollY.current = currentY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Show on mouse move near top
  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (event.clientY < 60) {
        setHidden(false);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => setHidden(true), 3000);
      }
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      // Fullscreen not supported
    }
  }, []);

  return (
    <header
      className="toolbar-auto-hide sticky left-0 right-0 top-0 z-30 border-b border-[var(--reader-border)] bg-[var(--reader-surface)]/95 backdrop-blur-sm"
      data-hidden={hidden}
    >
      <div className="mx-auto flex min-h-14 max-w-7xl items-center gap-1 px-2 sm:gap-3 sm:px-4">
        {/* Back link */}
        <Link
          className="flex items-center gap-1.5 text-sm font-semibold text-[var(--reader-accent)] hover:underline"
          href={backHref}
        >
          <Home size={16} />
          <span className="hidden sm:inline">{t("reader", "toolbar.library")}</span>
        </Link>

        {/* Divider */}
        <div className="h-5 w-px bg-[var(--reader-border)]" />

        {/* Title + page info */}
        <div className="hidden min-w-0 flex-1 sm:block">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <div className="flex gap-2 text-xs text-[var(--reader-muted)]">
            {chapterTitle ? <span className="max-w-44 truncate">{chapterTitle}</span> : null}
            <span>{t("reader", "sourcePage")}: {activePage}{pageCount ? ` / ${pageCount}` : ""}</span>
            <span>{t("reader", "readingPage")}: {readingPage}</span>
            <span aria-live="polite">
              {progressState === "saving"
                ? t("reader", "toolbar.saving")
                : progressState === "saved"
                  ? `✓ ${t("reader", "toolbar.saved")}`
                  : progressState === "failed"
                    ? t("reader", "toolbar.saveFailed")
                    : ""}
            </span>
          </div>
        </div>

        {/* Toolbar actions */}
        <div className="flex items-center gap-1.5">
          {/* Reading mode toggle */}
          <div className="flex rounded-lg border border-[var(--reader-border)] overflow-hidden">
            <button
              aria-label={t("reader", "toolbar.cleanMode")}
              aria-pressed={readingMode === "clean"}
              className="grid size-11 place-items-center text-[var(--reader-muted)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--reader-accent)] aria-pressed:bg-[var(--reader-surface-muted)] aria-pressed:text-[var(--reader-foreground)]"
              onClick={() => setReadingMode("clean")}
              title={t("reader", "toolbar.cleanMode")}
              type="button"
            >
              <Scroll size={16} />
            </button>
            <button
              aria-label={t("reader", "toolbar.bookMode")}
              aria-pressed={readingMode === "book"}
              className="grid size-11 place-items-center border-l border-[var(--reader-border)] text-[var(--reader-muted)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--reader-accent)] aria-pressed:bg-[var(--reader-surface-muted)] aria-pressed:text-[var(--reader-foreground)]"
              onClick={() => setReadingMode("book")}
              title={t("reader", "toolbar.bookMode")}
              type="button"
            >
              <BookOpen size={16} />
            </button>
            <button
              aria-label={t("reader", "toolbar.originalMode")}
              aria-pressed={readingMode === "original"}
              className="grid size-11 place-items-center border-l border-[var(--reader-border)] text-[var(--reader-muted)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--reader-accent)] aria-pressed:bg-[var(--reader-surface-muted)] aria-pressed:text-[var(--reader-foreground)]"
              onClick={() => setReadingMode("original")}
              title={t("reader", "toolbar.originalMode")}
              type="button"
            >
              <FileText size={16} />
            </button>
            <button
              aria-label={t("reader", "toolbar.studyMode")}
              aria-pressed={readingMode === "study"}
              className="grid size-11 place-items-center border-l border-[var(--reader-border)] text-[var(--reader-muted)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--reader-accent)] aria-pressed:bg-[var(--reader-surface-muted)] aria-pressed:text-[var(--reader-foreground)]"
              onClick={() => setReadingMode("study")}
              title={t("reader", "toolbar.studyMode")}
              type="button"
            >
              <GraduationCap size={16} />
            </button>
          </div>



          {/* Focus mode */}
          <button
            aria-label={t("reader", "toolbar.focusMode")}
            aria-pressed={preferences.focusMode}
            className="grid size-11 place-items-center rounded-lg border border-[var(--reader-border)] bg-[var(--reader-surface)] transition-colors hover:bg-[var(--reader-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--reader-accent)] aria-pressed:bg-[var(--reader-accent)] aria-pressed:text-[var(--reader-accent-foreground)]"
            onClick={() => updatePreferences({ focusMode: !preferences.focusMode })}
            title={t("reader", "toolbar.focusMode")}
            type="button"
          >
            <Focus size={16} />
          </button>

          {/* Fullscreen */}
          <button
            aria-label={
              isFullscreen
                ? t("reader", "toolbar.exitFullscreen")
                : t("reader", "toolbar.fullscreen")
            }
            className="hidden size-10 place-items-center rounded-lg border border-[var(--reader-border)] bg-[var(--reader-surface)] transition-colors hover:bg-[var(--reader-surface-muted)] sm:grid"
            onClick={() => void toggleFullscreen()}
            title={
              isFullscreen
                ? t("reader", "toolbar.exitFullscreen")
                : t("reader", "toolbar.fullscreen")
            }
            type="button"
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>

          {/* Extra children (settings, etc) */}
          {children}
        </div>
      </div>

      {/* Reading progress bar */}
      <div className="h-[3px] bg-[var(--reader-surface-muted)]">
        <div
          className="reading-progress-bar"
          style={{
            width: pageCount
              ? `${Math.max(1, (activePage / pageCount) * 100)}%`
              : "0%",
          }}
        />
      </div>
    </header>
  );
}

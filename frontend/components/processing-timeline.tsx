"use client";

import { useI18n } from "@/components/i18n-provider";

export const PROCESSING_STAGES = [
  "UPLOADING",
  "SAFETY_CHECK",
  "EXTRACTING",
  "STRUCTURING",
  "READABLE",
  "TOC",
  "INDEXING",
  "COMPLETE",
] as const;

type ProcessingTimelineProps = {
  activeStage: string;
  completedStages?: string[];
  progress?: number;
  failed?: boolean;
};

export function ProcessingTimeline({
  activeStage,
  completedStages = [],
  progress = 0,
  failed = false,
}: ProcessingTimelineProps) {
  const { t, formatNumber } = useI18n();
  const completed = new Set(completedStages);

  return (
    <section
      aria-label={t("upload", "processingTitle")}
      className="border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold">{t("upload", "processingTitle")}</h2>
        <span className="text-sm tabular-nums text-[var(--muted)]">
          {formatNumber(progress)}%
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden bg-[var(--surface-muted)]">
        <div
          className={`h-full transition-[width] ${
            failed ? "bg-[var(--danger)]" : "bg-[var(--accent)]"
          }`}
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {PROCESSING_STAGES.map((stage) => {
          const isComplete = completed.has(stage) || activeStage === "COMPLETE";
          const isActive = stage === activeStage && !isComplete;
          return (
            <li
              aria-current={isActive ? "step" : undefined}
              className={`flex items-center gap-3 text-sm ${
                isActive
                  ? "font-semibold text-[var(--accent-strong)]"
                  : isComplete
                    ? "text-[var(--foreground)]"
                    : "text-[var(--muted)]"
              }`}
              key={stage}
            >
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                  isComplete
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : isActive
                      ? "border-[var(--accent)]"
                      : "border-[var(--border-strong)]"
                }`}
              >
                {isComplete ? "✓" : PROCESSING_STAGES.indexOf(stage) + 1}
              </span>
              {t("reader", `processingStages.${stage}`)}
            </li>
          );
        })}
      </ol>
      {failed ? (
        <p className="mt-4 text-sm font-semibold text-[var(--danger)]">
          {t("reader", "processingFailed")}
        </p>
      ) : null}
    </section>
  );
}

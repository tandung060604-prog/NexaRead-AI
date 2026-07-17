"use client";

import { BookOpen, Check, ChevronRight, CircleHelp, Tags } from "lucide-react";
import { useMemo, useState } from "react";

import {
  KeywordDetail,
  KeywordFeedbackType,
  KeywordOccurrence,
  KeywordPreferences,
  KeywordPreferencesInput,
} from "@/lib/documents-api";

type KeywordGlossaryProps = {
  occurrences: KeywordOccurrence[];
  preferences: KeywordPreferences;
  selected: KeywordOccurrence | null;
  detail: KeywordDetail | null;
  loading: boolean;
  error: string | null;
  onSelect: (occurrence: KeywordOccurrence) => void;
  onNavigate: (occurrence: KeywordOccurrence) => void;
  onPreferences: (preferences: KeywordPreferencesInput) => void;
  onFeedback: (occurrence: KeywordOccurrence, type: KeywordFeedbackType) => Promise<void>;
};

const LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

function preferenceInput(
  preferences: KeywordPreferences,
  changes: Partial<KeywordPreferencesInput>,
): KeywordPreferencesInput {
  return {
    enabled: preferences.enabled,
    user_level: preferences.user_level,
    enabled_categories: preferences.enabled_categories,
    min_confidence: preferences.min_confidence,
    ...changes,
  };
}

export function KeywordGlossary({
  occurrences,
  preferences,
  selected,
  detail,
  loading,
  error,
  onSelect,
  onNavigate,
  onPreferences,
  onFeedback,
}: KeywordGlossaryProps) {
  const [feedbackState, setFeedbackState] = useState<
    "idle" | "saving" | "saved" | "failed"
  >("idle");
  const unique = useMemo(() => {
    const byKeyword = new Map<string, KeywordOccurrence>();
    occurrences.forEach((item) => {
      if (!byKeyword.has(item.keyword.id)) byKeyword.set(item.keyword.id, item);
    });
    return [...byKeyword.values()];
  }, [occurrences]);
  const selectedOccurrences = selected
    ? occurrences.filter((item) => item.keyword.id === selected.keyword.id)
    : [];
  const allCategoriesSelected =
    preferences.enabled_categories.length === preferences.available_categories.length;

  async function sendFeedback(type: KeywordFeedbackType) {
    if (!selected) return;
    setFeedbackState("saving");
    try {
      await onFeedback(selected, type);
      setFeedbackState("saved");
    } catch {
      setFeedbackState("failed");
    }
  }

  return (
    <section aria-label="Technical glossary">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tags aria-hidden="true" size={16} />
          <h2 className="text-xs font-semibold uppercase text-[var(--reader-muted)]">
            Technical terms
          </h2>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input
            checked={preferences.enabled}
            onChange={(event) =>
              onPreferences(preferenceInput(preferences, { enabled: event.target.checked }))
            }
            type="checkbox"
          />
          Show
        </label>
      </div>

      <div className="mt-4" role="group" aria-label="Explanation level">
        <span className="mb-2 block text-xs text-[var(--reader-muted)]">Reader level</span>
        <div className="grid grid-cols-3 border border-[var(--reader-border)]">
          {LEVELS.map((level) => (
            <button
              aria-pressed={preferences.user_level === level}
              className={`min-w-0 px-1 py-2 text-[10px] font-semibold ${
                preferences.user_level === level
                  ? "bg-[var(--reader-foreground)] text-[var(--reader-surface)]"
                  : "border-l border-[var(--reader-border)] first:border-l-0"
              }`}
              key={level}
              onClick={() => onPreferences(preferenceInput(preferences, { user_level: level }))}
              type="button"
            >
              {level.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-4 block text-xs text-[var(--reader-muted)]">
        Category
        <select
          className="mt-2 h-10 w-full border border-[var(--reader-border)] bg-[var(--reader-surface)] px-2 text-sm text-[var(--reader-foreground)]"
          onChange={(event) =>
            onPreferences(
              preferenceInput(preferences, {
                enabled_categories:
                  event.target.value === "ALL"
                    ? preferences.available_categories
                    : [event.target.value],
              }),
            )
          }
          value={allCategoriesSelected ? "ALL" : preferences.enabled_categories[0] ?? "ALL"}
        >
          <option value="ALL">All categories</option>
          {preferences.available_categories.map((category) => (
            <option key={category} value={category}>
              {category.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p className="mt-4 border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm" role="alert">
          {error}
        </p>
      ) : loading ? (
        <div aria-label="Loading technical terms" className="mt-5 h-24 animate-pulse bg-[var(--reader-surface-muted)]" />
      ) : !preferences.enabled ? (
        <p className="mt-5 text-sm leading-6 text-[var(--reader-muted)]">Technical term highlights are hidden.</p>
      ) : unique.length === 0 ? (
        <p className="mt-5 text-sm leading-6 text-[var(--reader-muted)]">No technical terms match these settings.</p>
      ) : (
        <ol className="mt-5 divide-y divide-[var(--reader-border)] border-y border-[var(--reader-border)]">
          {unique.map((occurrence) => (
            <li key={occurrence.keyword.id}>
              <button
                className="flex w-full items-center gap-2 py-3 text-left"
                onClick={() => onSelect(occurrence)}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{occurrence.keyword.canonical_name}</strong>
                  <span className="mt-1 block text-xs text-[var(--reader-muted)]">
                    {occurrence.keyword.category.replaceAll("_", " ")}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" size={15} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {selected && detail ? (
        <div className="mt-6 border-t border-[var(--reader-border)] pt-5">
          <div className="flex items-start gap-2">
            <BookOpen aria-hidden="true" className="mt-1 shrink-0" size={17} />
            <div>
              <h3 className="font-semibold">{detail.canonical_name}</h3>
              <p className="mt-2 text-sm leading-6">{detail.explanation}</p>
              <p className="mt-2 text-xs text-[var(--reader-muted)]">
                {detail.difficulty} · confidence {Math.round(selected.confidence * 100)}%
              </p>
            </div>
          </div>

          {detail.related_keywords.length > 0 ? (
            <div className="mt-5">
              <h4 className="text-xs font-semibold uppercase text-[var(--reader-muted)]">Related</h4>
              <p className="mt-2 text-sm">
                {detail.related_keywords.map((item) => item.canonical_name).join(", ")}
              </p>
            </div>
          ) : null}

          <div className="mt-5">
            <h4 className="text-xs font-semibold uppercase text-[var(--reader-muted)]">
              Other occurrences
            </h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedOccurrences.map((item, index) => (
                <button
                  className="border border-[var(--reader-border)] px-2 py-1 text-xs"
                  key={item.id}
                  onClick={() => onNavigate(item)}
                  type="button"
                >
                  {index + 1} · p.{item.page_number}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-[var(--reader-border)] pt-4">
            <p className="flex items-center gap-2 text-xs font-semibold">
              <CircleHelp aria-hidden="true" size={15} /> Was this technical term useful?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                className="inline-flex items-center gap-1 border border-[var(--reader-border)] px-2 py-1 text-xs"
                disabled={feedbackState === "saving"}
                onClick={() => void sendFeedback("HELPFUL")}
                type="button"
              >
                <Check size={13} /> Helpful
              </button>
              <button
                className="border border-[var(--reader-border)] px-2 py-1 text-xs"
                disabled={feedbackState === "saving"}
                onClick={() => void sendFeedback("NOT_TECHNICAL")}
                type="button"
              >
                Not technical
              </button>
            </div>
            <span aria-live="polite" className="mt-2 block text-xs text-[var(--reader-muted)]">
              {feedbackState === "saving"
                ? "Saving feedback"
                : feedbackState === "saved"
                  ? "Feedback saved"
                  : feedbackState === "failed"
                    ? "Feedback could not be saved"
                    : ""}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

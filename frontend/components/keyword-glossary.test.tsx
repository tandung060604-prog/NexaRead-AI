import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KeywordDetail, KeywordOccurrence, KeywordPreferences } from "@/lib/documents-api";
import { translate } from "@/lib/i18n";

import { KeywordGlossary } from "./keyword-glossary";

const occurrence: KeywordOccurrence = {
  id: "occurrence-1",
  keyword: {
    id: "keyword-1",
    canonical_name: "Python",
    slug: "python",
    category: "PROGRAMMING_LANGUAGE",
    short_definition: "A programming language.",
    difficulty: "BEGINNER",
    taxonomy_version: "test-v1",
  },
  document_id: "document-1",
  document_version_id: "version-1",
  content_block_id: "block-1",
  page_number: 2,
  sequence_number: 3,
  start_offset: 0,
  end_offset: 6,
  surface_text: "Python",
  confidence: 0.97,
  detection_method: "EXACT",
  is_suppressed: false,
};

const detail: KeywordDetail = {
  ...occurrence.keyword,
  aliases: ["Python 3"],
  explanation: "Python is a general-purpose programming language.",
  beginner_explanation: "Beginner explanation",
  intermediate_explanation: "Intermediate explanation",
  advanced_explanation: "Advanced explanation",
  related_keywords: [{ ...occurrence.keyword, id: "keyword-2", canonical_name: "FastAPI" }],
};

const preferences: KeywordPreferences = {
  id: null,
  enabled: true,
  user_level: "BEGINNER",
  enabled_categories: ["PROGRAMMING_LANGUAGE", "FRAMEWORK_LIBRARY"],
  min_confidence: 0.75,
  available_categories: ["PROGRAMMING_LANGUAGE", "FRAMEWORK_LIBRARY"],
  updated_at: null,
};

afterEach(cleanup);

describe("KeywordGlossary", () => {
  it("changes level and category using explicit controls", () => {
    const onPreferences = vi.fn();
    render(
      <KeywordGlossary
        detail={null}
        error={null}
        loading={false}
        occurrences={[occurrence]}
        onFeedback={vi.fn()}
        onNavigate={vi.fn()}
        onPreferences={onPreferences}
        onSelect={vi.fn()}
        preferences={preferences}
        selected={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "glossary.levels.ADVANCED"),
    }));
    fireEvent.change(screen.getByLabelText(
      translate("vi", "reader", "glossary.category"),
    ), {
      target: { value: "PROGRAMMING_LANGUAGE" },
    });

    expect(onPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ user_level: "ADVANCED" }),
    );
    expect(onPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ enabled_categories: ["PROGRAMMING_LANGUAGE"] }),
    );
  });

  it("shows explanation, related concepts, navigation, and feedback", async () => {
    const onNavigate = vi.fn();
    const onFeedback = vi.fn().mockResolvedValue(undefined);
    render(
      <KeywordGlossary
        detail={detail}
        error={null}
        loading={false}
        occurrences={[occurrence]}
        onFeedback={onFeedback}
        onNavigate={onNavigate}
        onPreferences={vi.fn()}
        onSelect={vi.fn()}
        preferences={preferences}
        selected={occurrence}
      />,
    );

    expect(screen.getByText(detail.explanation)).toBeInTheDocument();
    expect(screen.getByText("FastAPI")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: `1 · ${translate("vi", "reader", "sourcePage")} 2`,
    }));
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "glossary.helpful"),
    }));

    expect(onNavigate).toHaveBeenCalledWith(occurrence);
    await waitFor(() => expect(onFeedback).toHaveBeenCalledWith(occurrence, "HELPFUL"));
    expect(
      await screen.findByText(
        translate("vi", "reader", "glossary.feedbackSaved"),
      ),
    ).toBeInTheDocument();
  });

  it("renders an empty state without relying on color", () => {
    render(
      <KeywordGlossary
        detail={null}
        error={null}
        loading={false}
        occurrences={[]}
        onFeedback={vi.fn()}
        onNavigate={vi.fn()}
        onPreferences={vi.fn()}
        onSelect={vi.fn()}
        preferences={preferences}
        selected={null}
      />,
    );

    expect(
      screen.getByText(translate("vi", "reader", "glossary.empty")),
    ).toBeInTheDocument();
  });

  it("recovers from a feedback request failure", async () => {
    render(
      <KeywordGlossary
        detail={detail}
        error={null}
        loading={false}
        occurrences={[occurrence]}
        onFeedback={vi.fn().mockRejectedValue(new Error("offline"))}
        onNavigate={vi.fn()}
        onPreferences={vi.fn()}
        onSelect={vi.fn()}
        preferences={preferences}
        selected={occurrence}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "glossary.helpful"),
    }));

    expect(
      await screen.findByText(
        translate("vi", "reader", "glossary.feedbackFailed"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: translate("vi", "reader", "glossary.helpful"),
    })).toBeEnabled();
  });
});

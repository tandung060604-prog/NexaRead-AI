import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/i18n";

import { PersonalDashboard } from "./personal-dashboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PersonalDashboard", () => {
  it("renders reading sections, activity, and basic stats", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      continue_reading: [{
        id: "doc-1",
        title: "Practical RAG",
        source_type: "pdf",
        document_type: "TECHNICAL",
        created_at: "2026-07-23T00:00:00Z",
        progress_percent: 45,
        last_chapter: "Grounded retrieval",
        last_read_at: "2026-07-23T01:00:00Z",
        status: "AI_READY",
        processing_status: "COMPLETE",
        processing_progress: 100,
        cover_url: "/api/documents/doc-1/cover",
      }],
      recent_documents: [],
      processing_documents: [],
      completed_documents: [],
      collections: [{
        id: "collection-1",
        name: "Research",
        document_count: 3,
      }],
      recent_bookmarks: [{
        id: "bookmark-1",
        document_id: "doc-1",
        document_title: "Practical RAG",
        title: "Key retrieval section",
        page_number: 8,
        created_at: "2026-07-23T01:00:00Z",
      }],
      recent_notes: [{
        id: "note-1",
        document_id: "doc-1",
        document_title: "Practical RAG",
        content: "Compare rerankers",
        selected_text: "cross encoder",
        updated_at: "2026-07-23T01:00:00Z",
      }],
      stats: {
        total_documents: 1,
        in_progress_documents: 1,
        completed_documents: 0,
        bookmark_count: 1,
        note_count: 1,
        analytics_enabled: false,
        reading_time_seconds: 0,
        reading_streak_days: 0,
        source_pages_reached: 0,
      },
    }), { status: 200 })));

    render(<PersonalDashboard />);

    expect(await screen.findByRole("heading", {
      name: translate("vi", "library", "dashboard.title"),
    })).toBeInTheDocument();
    expect(screen.getAllByText("Practical RAG")).toHaveLength(2);
    expect(screen.getByText("Grounded retrieval")).toBeInTheDocument();
    expect(screen.getByText("Key retrieval section")).toBeInTheDocument();
    expect(screen.getByText("Compare rerankers")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Research/ })).toHaveAttribute(
      "href",
      "/library?collection_id=collection-1",
    );
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: translate("vi", "personalization", "analytics.enable"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        translate("vi", "personalization", "analytics.disabled"),
      ),
    ).toBeInTheDocument();
  });

  it("enables aggregate analytics without hiding the privacy control", async () => {
    const fetchMock = vi.fn().mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          String(input).includes("/reading-analytics/preference") &&
          init?.method === "PUT"
        ) {
          return Promise.resolve(new Response(JSON.stringify({
            active_dates: ["2026-07-23"],
            documents_completed: 1,
            documents_started: 2,
            enabled: true,
            reading_streak_days: 3,
            source_pages_reached: 42,
            total_reading_seconds: 5_400,
          }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          collections: [],
          completed_documents: [],
          continue_reading: [],
          processing_documents: [],
          recent_bookmarks: [],
          recent_documents: [],
          recent_notes: [],
          stats: {
            analytics_enabled: false,
            bookmark_count: 0,
            completed_documents: 1,
            in_progress_documents: 1,
            note_count: 0,
            reading_streak_days: 0,
            reading_time_seconds: 0,
            source_pages_reached: 0,
            total_documents: 2,
          },
        }), { status: 200 }));
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PersonalDashboard />);
    const enable = await screen.findByRole("button", {
      name: translate("vi", "personalization", "analytics.enable"),
    });
    fireEvent.click(enable);

    expect(await screen.findByText("1 giờ 30 phút")).toBeInTheDocument();
    expect(screen.getByText("3 ngày")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: translate("vi", "personalization", "analytics.disable"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        translate("vi", "personalization", "analytics.privacy"),
      ),
    ).toBeInTheDocument();
    const request = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes("/reading-analytics/preference") &&
      init?.method === "PUT",
    );
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ enabled: true });
  });
});

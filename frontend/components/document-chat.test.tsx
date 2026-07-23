import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/i18n";

import { DocumentChat } from "./document-chat";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DocumentChat", () => {
  it("renders grounded citations and navigates to the source block", async () => {
    const onCitation = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "message-1",
        session_id: "session-1",
        role: "assistant",
        content: "Grounded answer. [S1]",
        model: "test",
        latency_ms: 12,
        prompt_tokens: 10,
        completion_tokens: 4,
        cost_microusd: 0,
        status: "COMPLETED",
        citations: [{
          id: "citation-1",
          source_label: "S1",
          chunk_id: "chunk-1",
          content_block_id: "block-42",
          quoted_text: "Evidence excerpt",
          page_number: 3,
          section_title: "Retrieval",
          relevance_score: 0.9,
        }],
        created_at: "2026-07-17T00:00:00Z",
      }),
    }));
    render(<DocumentChat documentId="document-1" onCitation={onCitation} />);

    fireEvent.change(screen.getByLabelText(
      translate("vi", "chat", "questionLabel"),
    ), {
      target: { value: "How does retrieval work?" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "chat", "send"),
    }));

    expect(await screen.findByText("Grounded answer. [S1]")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: `S1 · ${translate("vi", "chat", "sourcePage", { page: 3 })}`,
    }));
    expect(onCitation).toHaveBeenCalledWith("block-42");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("keeps provider errors visible without inventing an answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Document is not AI ready" }),
    }));
    render(<DocumentChat documentId="document-1" onCitation={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(
      translate("vi", "chat", "questionLabel"),
    ), {
      target: { value: "What is this?" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "chat", "send"),
    }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Document is not AI ready");
    expect(
      screen.queryByLabelText(translate("vi", "chat", "sources")),
    ).not.toBeInTheDocument();
  });
});

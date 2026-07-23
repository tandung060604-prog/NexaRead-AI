import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Bookmark, ContentBlock, Highlight } from "@/lib/documents-api";
import { translate } from "@/lib/i18n";

import { AnnotationPanel, SelectionToolbar } from "./reader-tools";

const block = {
  id: "block-1",
  text: "Saved highlighted text",
} as ContentBlock;

const bookmark: Bookmark = {
  id: "bookmark-1",
  document_id: "document-1",
  document_version_id: "version-1",
  content_block_id: block.id,
  page_number: 1,
  title: "Saved block",
  created_at: "2026-07-17T00:00:00Z",
};

const highlight: Highlight = {
  id: "highlight-1",
  document_id: "document-1",
  document_version_id: "version-1",
  content_block_id: block.id,
  start_offset: 0,
  end_offset: 5,
  selected_text: "Saved",
  prefix_text: "",
  suffix_text: " highlighted",
  color: "blue",
  status: "ACTIVE",
  created_at: "2026-07-17T00:00:00Z",
  updated_at: "2026-07-17T00:00:00Z",
  note: null,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function panel(overrides: Partial<React.ComponentProps<typeof AnnotationPanel>> = {}) {
  const props: React.ComponentProps<typeof AnnotationPanel> = {
    blocksById: new Map([[block.id, block]]),
    bookmarks: [bookmark],
    highlights: [highlight],
    onDeleteBookmark: vi.fn(),
    onDeleteHighlight: vi.fn(),
    onDeleteNote: vi.fn().mockResolvedValue(undefined),
    onNavigate: vi.fn(),
    onSaveNote: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<AnnotationPanel {...props} />);
  return props;
}

describe("reader annotation tools", () => {
  it("creates a semantic-color highlight from a single-block selection", () => {
    const onCreate = vi.fn();
    render(
      <SelectionToolbar
        onCancel={vi.fn()}
        onCreate={onCreate}
        selection={{ block, startOffset: 0, endOffset: 5, selectedText: "Saved" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: `${translate("vi", "reader", "annotations.colors.green")} ${translate("vi", "reader", "highlights")}`,
    }));
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "annotations.save"),
    }));

    expect(onCreate).toHaveBeenCalledWith("green");
  });

  it("navigates and deletes bookmarks and highlights", () => {
    const props = panel();

    fireEvent.click(screen.getByRole("button", { name: "Saved block" }));
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "annotations.deleteBookmark", {
        title: bookmark.title,
      }),
    }));
    fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "annotations.deleteHighlight"),
    }));

    expect(props.onNavigate).toHaveBeenCalledWith(block.id);
    expect(props.onDeleteBookmark).toHaveBeenCalledWith(bookmark);
    expect(props.onDeleteHighlight).toHaveBeenCalledWith(highlight);
  });

  it("adds and autosave-statuses a note", async () => {
    const onSaveNote = vi.fn().mockResolvedValue(undefined);
    panel({ onSaveNote });
    const textarea = screen.getByRole("textbox", {
      name: translate("vi", "reader", "annotations.noteFor", { text: "Saved" }),
    });

    fireEvent.change(textarea, { target: { value: "My note" } });
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "annotations.saveNote"),
    }));

    expect(
      screen.getByText(translate("vi", "common", "status.saving")),
    ).toBeInTheDocument();
    await waitFor(() => expect(
      screen.getByText(translate("vi", "common", "status.saved")),
    ).toBeInTheDocument());
    expect(onSaveNote).toHaveBeenCalledWith(highlight, "My note");
  });

  it("shows note save failure", async () => {
    panel({ onSaveNote: vi.fn().mockRejectedValue(new Error("offline")) });
    fireEvent.change(screen.getByRole("textbox", {
      name: translate("vi", "reader", "annotations.noteFor", { text: "Saved" }),
    }), {
      target: { value: "Will fail" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "annotations.saveNote"),
    }));

    expect(
      await screen.findByText(translate("vi", "common", "status.failed")),
    ).toBeInTheDocument();
  });

  it("edits and deletes an existing note", async () => {
    const existing = {
      ...highlight,
      note: {
        id: "note-1",
        highlight_id: highlight.id,
        content: "Existing note",
        created_at: "2026-07-17T00:00:00Z",
        updated_at: "2026-07-17T00:00:00Z",
      },
    };
    const onSaveNote = vi.fn().mockResolvedValue(undefined);
    const onDeleteNote = vi.fn().mockResolvedValue(undefined);
    panel({ highlights: [existing], onSaveNote, onDeleteNote });

    fireEvent.change(screen.getByRole("textbox", {
      name: translate("vi", "reader", "annotations.noteFor", { text: "Saved" }),
    }), {
      target: { value: "Edited note" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "annotations.saveNote"),
    }));
    await waitFor(() => expect(onSaveNote).toHaveBeenCalledWith(existing, "Edited note"));
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "annotations.deleteNote"),
    }));

    expect(onDeleteNote).toHaveBeenCalledWith(existing);
  });
});

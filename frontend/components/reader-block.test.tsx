import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContentBlock, Highlight, KeywordOccurrence } from "@/lib/documents-api";
import { translate } from "@/lib/i18n";

import { ReaderBlock } from "./reader-block";

const block: ContentBlock = {
  id: "44444444-4444-4444-4444-444444444444",
  parent_block_id: null,
  sequence_number: 1,
  block_type: "PARAGRAPH",
  text: "NexaRead renders technical content safely.",
  source_text: "NexaRead renders technical content safely.",
  display_text: "NexaRead renders technical content safely.",
  transformation_log: [],
  transformation_confidence: 1,
  needs_review: false,
  source_anchor: {
    page_number: 1,
    source_block_ids: ["block-1"],
    source_start_offset: 0,
    source_end_offset: 42,
  },
  semantic_role: "paragraph",
  heading_level: null,
  keep_with_next: false,
  avoid_break_inside: false,
  break_before: false,
  break_after: false,
  indent_level: 0,
  text_align: "left",
  is_first_paragraph: true,
  is_chapter_opening: false,
  caption_for_asset_id: null,
  footnote_reference: null,
  source_page_number: 1,
  page_number: 1,
  chapter_index: null,
  section_index: null,
  paragraph_index: 1,
  start_offset: 0,
  end_offset: 41,
  bounding_box: [0, 0, 100, 20],
  font_name: "Helvetica",
  font_size: 11,
  is_bold: false,
  is_italic: false,
  confidence: 1,
  metadata: {},
  content_hash: "hash",
  created_at: "2026-07-17T00:00:00Z",
};

const highlight: Highlight = {
  id: "highlight-1",
  document_id: "document-1",
  document_version_id: "version-1",
  content_block_id: block.id,
  start_offset: 0,
  end_offset: 8,
  selected_text: "NexaRead",
  prefix_text: "",
  suffix_text: " renders",
  color: "yellow",
  status: "ACTIVE",
  created_at: "2026-07-17T00:00:00Z",
  updated_at: "2026-07-17T00:00:00Z",
  note: null,
};

const keyword: KeywordOccurrence = {
  id: "occurrence-1",
  keyword: {
    id: "keyword-1",
    canonical_name: "Technical content",
    slug: "technical-content",
    category: "SOFTWARE_ARCHITECTURE",
    short_definition: "Specialized content about technology.",
    difficulty: "BEGINNER",
    taxonomy_version: "test-v1",
  },
  document_id: "document-1",
  document_version_id: "version-1",
  content_block_id: block.id,
  page_number: 1,
  sequence_number: 1,
  start_offset: 17,
  end_offset: 34,
  surface_text: "technical content",
  confidence: 0.97,
  detection_method: "EXACT",
  is_suppressed: false,
};

function renderBlock(
  item: ContentBlock,
  highlights: Highlight[] = [],
  keywords: KeywordOccurrence[] = [],
  onKeywordSelect = vi.fn(),
) {
  return render(
    <ReaderBlock
      block={item}
      bookmarked={false}
      highlighted={false}
      highlights={highlights}
      keywords={keywords}
      onBookmark={vi.fn()}
      onKeywordSelect={onKeywordSelect}
      onSelection={vi.fn()}
      query=""
    />,
  );
}

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ReaderBlock", () => {
  it("renders persisted highlights", () => {
    renderBlock(block, [highlight]);

    expect(screen.getByText("NexaRead").tagName).toBe("MARK");
    expect(screen.getByText("NexaRead")).toHaveAttribute("data-highlight-id", highlight.id);
  });

  it("opens a keyboard-accessible keyword tooltip without replacing source text", () => {
    const onKeywordSelect = vi.fn();
    renderBlock(block, [], [keyword], onKeywordSelect);

    const term = screen.getByRole("button", {
      name: translate("vi", "reader", "block.technicalTerm", {
        name: "Technical content",
      }),
    });
    fireEvent.focus(term);

    expect(screen.getByRole("tooltip")).toHaveTextContent("Specialized content about technology.");
    expect(onKeywordSelect).toHaveBeenCalledWith(keyword);
    expect(term.closest("p")).toHaveTextContent(block.text);

    fireEvent.keyDown(term, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps user highlights and keyword marks as separate layers", () => {
    const overlappingHighlight = {
      ...highlight,
      id: "highlight-overlap",
      start_offset: 17,
      end_offset: 34,
      selected_text: "technical content",
    };
    renderBlock(block, [overlappingHighlight], [keyword]);

    const term = screen.getByRole("button", {
      name: translate("vi", "reader", "block.technicalTerm", {
        name: "Technical content",
      }),
    });
    expect(term.closest("mark")).toHaveAttribute("data-highlight-id", "highlight-overlap");
  });

  it("preserves source highlight offsets when rendering a page fragment", () => {
    const fragmentHighlight = {
      ...highlight,
      id: "fragment-highlight",
      start_offset: 9,
      end_offset: 16,
      selected_text: "renders",
    };
    const view = render(
      <ReaderBlock
        block={block}
        bookmarked={false}
        highlighted={false}
        highlights={[fragmentHighlight]}
        keywords={[]}
        onBookmark={vi.fn()}
        onKeywordSelect={vi.fn()}
        onSelection={vi.fn()}
        query=""
        rangeEnd={34}
        rangeStart={9}
      />,
    );

    expect(screen.getByText("renders")).toHaveAttribute(
      "data-highlight-id",
      "fragment-highlight",
    );
    const fragment = view.container.querySelector(
      `[id="block-${block.id}-fragment-9"]`,
    );
    expect(fragment).toHaveAttribute("data-source-start", "9");
    expect(fragment).toHaveAttribute("data-source-end", "34");
    expect(fragment).toHaveTextContent(block.text.slice(9, 34));
    expect(fragment).not.toHaveTextContent("NexaRead");
  });

  it("syntax-highlights and copies code", async () => {
    const code = { ...block, block_type: "CODE" as const, text: "const answer = 42;", metadata: { language: "javascript" } };
    renderBlock(code);

    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "block.copyCode"),
    }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(code.text));
    expect(document.querySelector(".hljs-keyword")).toBeInTheDocument();
  });

  it("renders responsive structured tables", () => {
    renderBlock({ ...block, block_type: "TABLE", metadata: { rows: [["Name", "Value"], ["NexaRead", "AI reader"]] } });

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("AI reader")).toBeInTheDocument();
  });

  it("falls back to formula source when KaTeX input is invalid", () => {
    renderBlock({ ...block, block_type: "FORMULA", text: "\\invalidcommand{" });

    expect(screen.getByText("\\invalidcommand{")).toBeInTheDocument();
  });

  it("uses the protected lazy image endpoint", () => {
    renderBlock({ ...block, block_type: "IMAGE", text: "Architecture diagram" });

    const image = screen.getByRole("img", { name: "Architecture diagram" });
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute(
      "src",
      `/api/documents/content-blocks/${block.id}/image`,
    );
  });

  it("never treats uploaded code or formula source as document HTML", () => {
    const view = renderBlock({
      ...block,
      block_type: "CODE",
      text: '<img src="x" onerror="alert(1)">',
    });
    expect(view.container.querySelector("img")).not.toBeInTheDocument();
    view.unmount();

    renderBlock({
      ...block,
      block_type: "FORMULA",
      text: "\\href{javascript:alert(1)}{unsafe}",
    });
    expect(document.querySelector('a[href^="javascript:"]')).not.toBeInTheDocument();
  });
});

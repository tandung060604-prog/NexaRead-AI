import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContentBlock, ProcessingStatus, TocItem } from "@/lib/documents-api";
import { translate } from "@/lib/i18n";

import { DocumentReader } from "./document-reader";
import { ReaderExperience } from "./reader-experience";

const virtualizerMocks = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (index: number) => string }) => ({
    getTotalSize: () => count * 80,
    getVirtualItems: () => Array.from({ length: Math.min(count, 12) }, (_, index) => ({
      end: (index + 1) * 80,
      index,
      key: getItemKey(index),
      size: 80,
      start: index * 80,
    })),
    measureElement: vi.fn(),
    scrollOffset: 0,
    scrollToIndex: virtualizerMocks.scrollToIndex,
  }),
}));

const documentId = "11111111-1111-1111-1111-111111111111";

function apiResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const documentDetail = {
  id: documentId,
  title: "Reader Guide",
  original_filename: "reader-guide.pdf",
  source_type: "pdf",
  mime_type: "application/pdf",
  file_size: 4096,
  status: "AI_READY",
  created_at: "2026-07-16T00:00:00Z",
  updated_at: "2026-07-16T00:00:00Z",
  last_read_at: null,
  versions: [{
    id: "22222222-2222-2222-2222-222222222222",
    version_number: 1,
    content_hash: "hash",
    page_count: 1,
    created_at: "2026-07-16T00:00:00Z",
  }],
  processing_jobs: [],
};

const readableStatus: ProcessingStatus = {
  document_id: documentId,
  status: "AI_READY",
  stage: "AI_READY",
  progress: 100,
  error_code: null,
  error_message: null,
  page_count: 1,
  completed_stages: [
    "UPLOADING",
    "SAFETY_CHECK",
    "EXTRACTING",
    "STRUCTURING",
    "READABLE",
    "TOC",
    "INDEXING",
    "COMPLETE",
  ],
};

const headingBlock: ContentBlock = {
  id: "33333333-3333-3333-3333-333333333333",
  parent_block_id: null,
  sequence_number: 1,
  block_type: "HEADING_1",
  text: "Reader Guide",
  source_text: "Reader Guide",
  display_text: "Reader Guide",
  transformation_log: [],
  transformation_confidence: 1,
  needs_review: false,
  source_anchor: {
    page_number: 1,
    source_block_ids: ["33333333-3333-3333-3333-333333333333"],
    source_start_offset: 0,
    source_end_offset: 12,
  },
  semantic_role: "heading",
  heading_level: 1,
  keep_with_next: true,
  avoid_break_inside: false,
  break_before: true,
  break_after: false,
  indent_level: 0,
  text_align: "left",
  is_first_paragraph: false,
  is_chapter_opening: true,
  caption_for_asset_id: null,
  footnote_reference: null,
  source_page_number: 1,
  page_number: 1,
  chapter_index: 1,
  section_index: null,
  paragraph_index: null,
  start_offset: 0,
  end_offset: 12,
  bounding_box: [72, 72, 200, 96],
  font_name: "Helvetica-Bold",
  font_size: 22,
  is_bold: true,
  is_italic: false,
  confidence: 0.95,
  metadata: {},
  content_hash: "heading-hash",
  created_at: "2026-07-16T00:00:00Z",
};

const paragraphBlock: ContentBlock = {
  ...headingBlock,
  id: "44444444-4444-4444-4444-444444444444",
  parent_block_id: headingBlock.id,
  sequence_number: 2,
  block_type: "PARAGRAPH",
  text: "Search finds a unique lexical phrase in this paragraph.",
  paragraph_index: 1,
  start_offset: 14,
  end_offset: 70,
  font_name: "Helvetica",
  font_size: 11,
  is_bold: false,
  confidence: 0.9,
  content_hash: "paragraph-hash",
};

const tocItem: TocItem = {
  block_id: headingBlock.id,
  title: "Reader Guide",
  level: 1,
  page_number: 1,
  sequence_number: 1,
};

type MockOptions = {
  status?: ProcessingStatus;
  documentType?: string;
  useDocumentTypeDefaults?: boolean;
  readingMode?: "original" | "clean" | "book" | "study";
  theme?: "light" | "sepia" | "dark";
  toc?: TocItem[];
  blocks?: ContentBlock[];
  searchItems?: ContentBlock[];
  failInitial?: boolean;
  progress?: Record<string, unknown> | null;
  bookmarks?: Record<string, unknown>[];
  highlights?: Record<string, unknown>[];
  failProgressSave?: boolean;
};

function mockReaderApi(options: MockOptions = {}) {
  const status = options.status ?? readableStatus;
  const toc = options.toc ?? [tocItem];
  const blocks = options.blocks ?? [headingBlock, paragraphBlock];
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (options.failInitial) {
      return Promise.resolve(apiResponse({ detail: "Reader unavailable" }, 500));
    }
    if (url.includes("/processing-status")) return Promise.resolve(apiResponse(status));
    if (url.includes("/toc")) return Promise.resolve(apiResponse({ items: toc }));
    if (url.includes("/blocks?")) {
      return Promise.resolve(apiResponse({ items: blocks, total: blocks.length, limit: 200, offset: 0 }));
    }
    if (url.includes("/search?")) {
      const items = options.searchItems ?? [paragraphBlock];
      return Promise.resolve(apiResponse({ query: "unique lexical", items, total: items.length }));
    }
    if (url.includes("/progress")) {
      if (method === "PUT" && options.failProgressSave) {
        return Promise.resolve(apiResponse({ detail: "Progress unavailable" }, 503));
      }
      return Promise.resolve(apiResponse(method === "PUT" ? options.progress ?? {} : options.progress ?? null));
    }
    if (url.includes("/bookmarks")) {
      if (method === "DELETE") return Promise.resolve(apiResponse(undefined, 204));
      if (method === "POST") return Promise.resolve(apiResponse({
        id: "bookmark-1",
        document_id: documentId,
        document_version_id: documentDetail.versions[0].id,
        content_block_id: paragraphBlock.id,
        page_number: 1,
        title: paragraphBlock.text,
        created_at: "2026-07-17T00:00:00Z",
      }, 201));
      return Promise.resolve(apiResponse({ items: options.bookmarks ?? [] }));
    }
    if (url.includes("/highlights")) {
      return Promise.resolve(apiResponse({ items: options.highlights ?? [] }));
    }
    if (url.includes("/keyword-preferences")) {
      return Promise.resolve(apiResponse({
        id: null,
        enabled: true,
        user_level: "BEGINNER",
        enabled_categories: ["PROGRAMMING_LANGUAGE"],
        min_confidence: 0.75,
        available_categories: ["PROGRAMMING_LANGUAGE"],
        updated_at: null,
      }));
    }
    if (url.includes(`/documents/${documentId}/keywords`)) {
      return Promise.resolve(apiResponse({
        items: [],
        total: 0,
        categories: ["PROGRAMMING_LANGUAGE"],
        taxonomy_version: "test-v1",
      }));
    }
    if (url.includes("/reading-preferences")) {
      return Promise.resolve(apiResponse({
        id: null,
        theme: options.theme ?? "light",
        font_size: 17,
        line_height: 1.8,
        reading_width: 720,
        font_family: "sans",
        focus_mode: false,
        reading_mode: options.readingMode ?? "clean",
        reading_room: "minimal-focus",
        page_turn_animation: true,
        page_turn_sound: false,
        ambient_sound: false,
        master_volume: 0.7,
        ambient_volume: 0.5,
        page_turn_volume: 0.6,
        language: "vi",
        keyword_level: "BEGINNER",
        use_document_type_defaults:
          options.useDocumentTypeDefaults ?? true,
        analytics_enabled: false,
        updated_at: null,
      }));
    }
    const documentType = options.documentType ?? "OTHER";
    return Promise.resolve(apiResponse({
      ...documentDetail,
      document_type_override: null,
      layout_override: null,
      layout_type: documentType,
      processing_result: {
        chapter_count: 1,
        detected_document_type: documentType,
        document_type_override: null,
        effective_document_type: documentType,
        language: "vi",
        layout_quality: "HIGH",
        layout_quality_score: 0.95,
        source_page_count: 1,
        warnings: [],
      },
      status: status.status,
    }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  virtualizerMocks.scrollToIndex.mockClear();
  window.localStorage.clear();
  window.localStorage.setItem(
    "nexaread:immersive:preferences",
    JSON.stringify({ selectedRoom: "minimal-focus" }),
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DocumentReader", () => {
  it("shows the processing stage and progress", async () => {
    mockReaderApi({ status: { ...readableStatus, status: "QUEUED", stage: "QUEUED", progress: 0 } });

    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );

    expect(await screen.findByRole("heading", {
      name: translate("vi", "reader", "processingStages.QUEUED"),
    })).toBeInTheDocument();
    expect(screen.getByText(
      `0% ${translate("vi", "reader", "progressComplete")}`,
    )).toBeInTheDocument();
  });

  it("renders readable content using semantic block elements", async () => {
    mockReaderApi();

    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );

    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Reader Guide" })).toHaveLength(2));
    expect(screen.getByText(paragraphBlock.text)).toBeInTheDocument();
    expect(screen.getByText(
      `${translate("vi", "reader", "sourcePage")}: 1 / 1`,
    )).toBeInTheDocument();
    expect(screen.getByText(
      `${translate("vi", "reader", "readingPage")}: 1`,
    )).toBeInTheDocument();
  });

  it("shows a safe processing failure state", async () => {
    mockReaderApi({ status: { ...readableStatus, status: "FAILED", stage: "FAILED", error_code: "PDF_PARSE_FAILED" } });

    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );

    expect(
      await screen.findByText(
        translate("vi", "reader", "processingFailed"),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/traceback/i)).not.toBeInTheDocument();
  });

  it("shows the OCR required fallback", async () => {
    mockReaderApi({ status: { ...readableStatus, status: "OCR_REQUIRED", stage: "OCR_REQUIRED", error_code: "OCR_REQUIRED" } });

    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );

    expect(
      await screen.findByText(translate("vi", "reader", "ocrRequired")),
    ).toBeInTheDocument();
  });

  it("renders an empty TOC state", async () => {
    mockReaderApi({ toc: [] });

    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );

    expect(
      await screen.findByText(translate("vi", "reader", "tocEmpty")),
    ).toBeInTheDocument();
  });

  it("navigates from a TOC item to its stable block anchor", async () => {
    mockReaderApi();
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );
    await screen.findByText(paragraphBlock.text);

    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "tocItem", {
        title: "Reader Guide",
        page: 1,
      }),
    }));

    await waitFor(() => expect(document.getElementById(`block-${headingBlock.id}`)).toHaveClass("reader-navigation-flash"));
  });

  it("navigates a book TOC target to its measured page", async () => {
    const targetHeading: ContentBlock = {
      ...headingBlock,
      id: "77777777-7777-7777-7777-777777777777",
      sequence_number: 3,
      text: "Measured book destination",
      source_text: "Measured book destination",
      display_text: "Measured book destination",
      source_page_number: 2,
      page_number: 2,
      content_hash: "measured-book-destination",
    };
    mockReaderApi({
      blocks: [headingBlock, paragraphBlock, targetHeading],
      readingMode: "book",
      toc: [
        tocItem,
        {
          block_id: targetHeading.id,
          title: targetHeading.text,
          level: 1,
          page_number: 2,
          sequence_number: 3,
        },
      ],
      useDocumentTypeDefaults: false,
    });
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>,
    );
    await waitFor(() =>
      expect(document.querySelector(".book-page")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "tocItem", {
        title: targetHeading.text,
        page: 2,
      }),
    }));

    await waitFor(() =>
      expect(screen.getByRole("heading", {
        name: targetHeading.text,
      })).toBeInTheDocument(),
    );
  });

  it("performs lexical search", async () => {
    const fetchMock = mockReaderApi();
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );
    fireEvent.click(await screen.findByRole("tab", {
      name: translate("vi", "reader", "panels.search"),
    }));
    const input = await screen.findByLabelText(
      translate("vi", "reader", "panels.searchDocument"),
    );

    fireEvent.change(input, { target: { value: "unique lexical" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect(
      await screen.findByText(
        translate("vi", "reader", "searchResults", { count: 1 }),
      ),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/search?"))).toBe(true);
  });

  it("navigates and highlights a search result", async () => {
    mockReaderApi();
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );
    fireEvent.click(await screen.findByRole("tab", {
      name: translate("vi", "reader", "panels.search"),
    }));
    const input = await screen.findByLabelText(
      translate("vi", "reader", "panels.searchDocument"),
    );
    fireEvent.change(input, { target: { value: "unique lexical" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await screen.findByText(
      translate("vi", "reader", "searchResults", { count: 1 }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Search finds a unique lexical phrase/ }));

    await waitFor(() => expect(document.getElementById(`block-${paragraphBlock.id}`)).toHaveClass("reader-navigation-flash"));
  });

  it("links to the ownership-checked original PDF endpoint", async () => {
    mockReaderApi({ status: { ...readableStatus, status: "OCR_REQUIRED", stage: "OCR_REQUIRED" } });

    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );

    const link = await screen.findByRole("link", {
      name: translate("vi", "reader", "viewOriginal"),
    });
    expect(link).toHaveAttribute("href", `/api/documents/${documentId}/original`);
  });

  it("opens reader tools for the mobile layout", async () => {
    mockReaderApi();
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );
    await screen.findByText(paragraphBlock.text);

    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "panels.contents"),
    }));

    expect(screen.getByRole("dialog", {
      name: translate("vi", "reader", "panels.tools"),
    })).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: translate("vi", "reader", "panels.closeTools"),
    })).toBeInTheDocument();
  });

  it("mounts only a small virtual window for 5,000 blocks", async () => {
    const manyBlocks = Array.from({ length: 5_000 }, (_, index) => ({
      ...paragraphBlock,
      id: `virtual-block-${index}`,
      sequence_number: index + 1,
      text: `Virtual block ${index}`,
    }));
    mockReaderApi({ blocks: manyBlocks });

    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );
    await screen.findByLabelText(
      translate("vi", "reader", "virtualContent"),
    );

    await waitFor(() => expect(document.querySelectorAll("[data-index]")).toHaveLength(12));
    expect(document.querySelectorAll("[data-index]").length).toBeLessThan(manyBlocks.length);
  });

  it("restores server progress through virtualized navigation", async () => {
    mockReaderApi({
      progress: {
        id: "progress-1",
        document_id: documentId,
        document_version_id: documentDetail.versions[0].id,
        last_block_id: paragraphBlock.id,
        page_number: 1,
        progress_percent: 50,
        scroll_offset: 80,
        reading_mode: "study",
        updated_at: "2026-07-17T00:00:00Z",
      },
    });

    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );

    await waitFor(() => expect(virtualizerMocks.scrollToIndex).toHaveBeenCalledWith(1, { align: "center" }));
    expect(screen.getByRole("button", {
      name: translate("vi", "reader", "toolbar.studyMode"),
    })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers four reading modes and persists the selected mode per document", async () => {
    const fetchMock = mockReaderApi();
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );
    await screen.findByText(paragraphBlock.text);

    const modeNames = [
      "originalMode",
      "cleanMode",
      "bookMode",
      "studyMode",
    ] as const;
    for (const name of modeNames) {
      expect(screen.getByRole("button", {
        name: translate("vi", "reader", `toolbar.${name}`),
      })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "toolbar.studyMode"),
    }));

    expect(await screen.findByLabelText(
      translate("vi", "reader", "panels.studyTools"),
    )).toBeInTheDocument();
    await waitFor(
      () => {
        const request = fetchMock.mock.calls.find(([url, init]) => {
          if (!String(url).includes("/progress") || init?.method !== "PUT") return false;
          return JSON.parse(String(init.body)).reading_mode === "study";
        });
        expect(request).toBeDefined();
      },
      { timeout: 2_500 },
    );
  });

  it("persists a deliberate reader override without overwriting analytics", async () => {
    const fetchMock = mockReaderApi();
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );
    await screen.findByText(paragraphBlock.text);
    await new Promise((resolve) => window.setTimeout(resolve, 750));
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/reading-preferences") &&
          init?.method === "PUT",
      ),
    ).toBe(false);

    fireEvent.click(
      document.querySelector(
        'button[aria-controls="reader-settings-popover"]',
      ) as HTMLButtonElement,
    );
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "settingsLabels.dark"),
    }));

    await waitFor(
      () => {
        const request = fetchMock.mock.calls.find(([url, init]) =>
          String(url).includes("/reading-preferences") &&
          init?.method === "PUT",
        );
        expect(request).toBeDefined();
        const body = JSON.parse(String(request?.[1]?.body));
        expect(body).toMatchObject({
          ambient_sound: false,
          keyword_level: "BEGINNER",
          language: "vi",
          page_turn_sound: false,
          reading_mode: "clean",
          reading_room: "minimal-focus",
          analytics_enabled: false,
          use_document_type_defaults: false,
        });
      },
      { timeout: 2_500 },
    );
  });

  it("applies technical defaults and opens the terminology panel", async () => {
    mockReaderApi({ documentType: "TECHNICAL" });
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>,
    );

    await screen.findByText(paragraphBlock.text);
    expect(
      screen.getByRole("tab", {
        name: translate("vi", "reader", "panels.terms"),
      }),
    ).toHaveAttribute("aria-selected", "true");
    const content = screen.getByLabelText(
      translate("vi", "reader", "virtualContent"),
    );
    expect(content.querySelector("article")).toHaveStyle({
      maxWidth: "860px",
    });
  });

  it("applies book mode, sepia, and serif typography for books", async () => {
    mockReaderApi({ documentType: "BOOK" });
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: translate("vi", "reader", "toolbar.bookMode"),
        }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(document.querySelector(".reader-theme")).toHaveAttribute(
      "data-theme",
      "sepia",
    );
  });

  it("keeps an explicit account override ahead of document defaults", async () => {
    mockReaderApi({
      documentType: "TECHNICAL",
      useDocumentTypeDefaults: false,
    });
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>,
    );

    await screen.findByText(paragraphBlock.text);
    expect(
      screen.getByRole("tab", {
        name: translate("vi", "reader", "panels.ask"),
      }),
    ).toHaveAttribute("aria-selected", "true");
    const content = screen.getByLabelText(
      translate("vi", "reader", "virtualContent"),
    );
    expect(content.querySelector("article")).toHaveStyle({
      maxWidth: "720px",
    });
  });

  it("opens abstract, section, and source tools for research papers", async () => {
    const abstractBlock = {
      ...paragraphBlock,
      id: "55555555-5555-5555-5555-555555555555",
      text: "Abstract",
      block_type: "HEADING_1",
      sequence_number: 3,
    } satisfies ContentBlock;
    const abstractBody = {
      ...paragraphBlock,
      id: "66666666-6666-6666-6666-666666666666",
      text: "Grounded research abstract.",
      sequence_number: 4,
    } satisfies ContentBlock;
    const reference = {
      ...paragraphBlock,
      id: "77777777-7777-7777-7777-777777777777",
      text: "[1] Grounded retrieval.",
      semantic_role: "reference",
      sequence_number: 5,
    } satisfies ContentBlock;
    mockReaderApi({
      blocks: [
        headingBlock,
        paragraphBlock,
        abstractBlock,
        abstractBody,
        reference,
      ],
      documentType: "RESEARCH_PAPER",
    });
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>,
    );

    expect(
      await screen.findByRole("tab", {
        name: translate("vi", "reader", "panels.references"),
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getAllByText("Grounded research abstract."),
    ).not.toHaveLength(0);
    expect(screen.getAllByText("[1] Grounded retrieval.")).not.toHaveLength(0);
  });

  it("labels Vietnamese legal navigation without changing headings", async () => {
    mockReaderApi({
      documentType: "LEGAL",
      toc: [{ ...tocItem, title: "Điều 1. Phạm vi điều chỉnh" }],
    });
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>,
    );

    expect(
      await screen.findByRole("complementary", {
        name: translate("vi", "reader", "panels.legalContents"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Điều 1\. Phạm vi điều chỉnh/,
      }),
    ).toBeInTheDocument();
  });

  it("debounces progress writes to the backend", async () => {
    const fetchMock = mockReaderApi();
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );
    await screen.findByText(paragraphBlock.text);

    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/progress") && init?.method === "PUT")).toBe(false);
    await waitFor(
      () => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/progress") && init?.method === "PUT")).toBe(true),
      { timeout: 2_500 },
    );
  });

  it("applies theme and focus mode preferences", async () => {
    mockReaderApi({
      readingMode: "book",
      useDocumentTypeDefaults: false,
    });
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );
    await waitFor(() =>
      expect(document.querySelector(".book-page")).toBeInTheDocument(),
    );

    fireEvent.click(
      document.querySelector(
        'button[aria-controls="reader-settings-popover"]',
      ) as HTMLButtonElement,
    );
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "settingsLabels.sepia"),
    }));
    expect(document.querySelector(".reader-theme")).toHaveAttribute("data-theme", "sepia");
    expect(document.querySelector(".book-page")).toHaveStyle({
      "--room-page-color": "var(--reader-surface)",
    });
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "settingsLabels.dark"),
    }));
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "toolbar.focusMode"),
    }));

    expect(document.querySelector(".reader-theme")).toHaveAttribute("data-theme", "dark");
    expect(document.querySelector(".book-page")).toHaveStyle({
      "--room-page-color": "var(--reader-surface)",
    });
    expect(screen.getByRole("button", {
      name: translate("vi", "reader", "toolbar.focusMode"),
    })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("tablist", {
      name: translate("vi", "reader", "panels.toolTabs"),
    })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: translate("vi", "reader", "panels.collapseContents"),
    })).not.toBeInTheDocument();
  });

  it("shows one right-hand tool tab at a time and collapses the TOC", async () => {
    mockReaderApi();
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );
    await screen.findByText(paragraphBlock.text);

    expect(screen.queryByLabelText(
      translate("vi", "reader", "panels.searchDocument"),
    )).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", {
      name: translate("vi", "reader", "panels.search"),
    }));
    expect(await screen.findByLabelText(
      translate("vi", "reader", "panels.searchDocument"),
    )).toBeInTheDocument();

    const collapse = screen.getByRole("button", {
      name: translate("vi", "reader", "panels.collapseContents"),
    });
    fireEvent.click(collapse);
    expect(screen.getByRole("button", {
      name: translate("vi", "reader", "panels.expandContents"),
    })).toHaveAttribute("aria-expanded", "false");
  });

  it("shows a progress save failure without hiding reader content", async () => {
    mockReaderApi({ failProgressSave: true });
    render(
      <ReaderExperience>
        <DocumentReader documentId={documentId} />
      </ReaderExperience>
    );

    expect(await screen.findByText(paragraphBlock.text)).toBeInTheDocument();
    expect(
      await screen.findByText(
        translate("vi", "reader", "toolbar.saveFailed"),
        {},
        { timeout: 2_500 },
      ),
    ).toBeInTheDocument();
  });
});

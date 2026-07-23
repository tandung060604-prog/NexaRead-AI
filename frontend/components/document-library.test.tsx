import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/i18n";

import { DocumentLibrary } from "./document-library";

const document = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Project Brief",
  original_filename: "project-brief.pdf",
  source_type: "pdf",
  source_url: null,
  mime_type: "application/pdf",
  file_size: 2048,
  collection_id: null,
  layout_type: "GENERAL_DOCUMENT",
  layout_override: null,
  document_type_override: null,
  status: "UPLOADED",
  created_at: "2026-07-16T00:00:00Z",
  updated_at: "2026-07-16T00:00:00Z",
  last_read_at: null,
  archived_at: null,
  collection: null,
  tags: [],
  progress_percent: 35,
  language: "en",
  completed: false,
};

function documentList(items = [document]) {
  return { items, total: items.length, limit: 100, offset: 0 };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubLibraryApi(initialItems = [document]) {
  let items = [...initialItems];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/collections")) return jsonResponse([]);
    if (url.endsWith("/api/tags")) return jsonResponse([]);
    if (url.includes("/api/documents?")) return jsonResponse(documentList(items));
    if (init?.method === "PATCH" && /\/api\/documents\/[^/]+$/.test(url)) {
      const body = JSON.parse(String(init.body)) as { title: string };
      items = items.map((item) =>
        item.id === document.id ? { ...item, title: body.title } : item,
      );
      return jsonResponse({ ...items[0], versions: [], processing_jobs: [] });
    }
    if (init?.method === "DELETE" && url.endsWith(`/api/documents/${document.id}`)) {
      items = [];
      return jsonResponse(null, 204);
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DocumentLibrary", () => {
  it("renders the empty library state", async () => {
    stubLibraryApi([]);

    render(<DocumentLibrary />);

    expect(
      await screen.findByText(translate("vi", "library", "emptyTitle")),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: translate("vi", "library", "uploadAction"),
      }),
    ).toHaveAttribute("href", "/upload");
  });

  it("renders document metadata, progress, and switches view", async () => {
    stubLibraryApi();

    render(<DocumentLibrary />);

    expect((await screen.findAllByText("Project Brief")).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("progressbar", { name: "35%" }),
    ).toHaveAttribute("aria-valuenow", "35");
    const listButton = screen.getByRole("button", {
      name: translate("vi", "library", "view.list"),
    });
    fireEvent.click(listButton);
    expect(listButton).toHaveAttribute("aria-pressed", "true");
  });

  it("sends search, sort, and filter values to the backend", async () => {
    const fetchMock = stubLibraryApi();
    render(<DocumentLibrary />);
    await screen.findAllByText("Project Brief");

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: translate("vi", "library", "search"),
      }),
      { target: { value: "brief" } },
    );
    fireEvent.change(
      screen.getByLabelText(translate("vi", "library", "sort.label")),
      { target: { value: "progress" } },
    );
    fireEvent.change(
      screen.getByLabelText(translate("vi", "library", "filters.type")),
      { target: { value: "pdf" } },
    );

    await waitFor(
      () => {
        const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
        expect(
          requestedUrls.some(
            (url) =>
              url.includes("search=brief") &&
              url.includes("sort=progress") &&
              url.includes("source_type=pdf"),
          ),
        ).toBe(true);
      },
      { timeout: 2000 },
    );
  });

  it("renames a document and refreshes the list", async () => {
    const fetchMock = stubLibraryApi();
    render(<DocumentLibrary />);

    await screen.findAllByText("Project Brief");
    fireEvent.click(
      screen.getByRole("button", {
        name: translate("vi", "library", "rename"),
      }),
    );
    fireEvent.change(
      screen.getByLabelText(
        translate("vi", "library", "renameLabel", {
          title: "Project Brief",
        }),
      ),
      { target: { value: "Renamed Brief" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: translate("vi", "common", "actions.save"),
      }),
    );

    expect((await screen.findAllByText("Renamed Brief")).length).toBeGreaterThan(0);
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(true);
  });

  it("requires confirmation before deleting and refreshes the list", async () => {
    const fetchMock = stubLibraryApi();
    render(<DocumentLibrary />);

    await screen.findAllByText("Project Brief");
    fireEvent.click(
      screen.getByRole("button", {
        name: translate("vi", "library", "delete"),
      }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", {
        name: translate("vi", "library", "deleteDocument"),
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(translate("vi", "library", "emptyTitle")),
      ).toBeInTheDocument(),
    );
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(true);
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentLibrary } from "./document-library";

function apiResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const document = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Project Brief",
  original_filename: "project-brief.pdf",
  source_type: "pdf",
  mime_type: "application/pdf",
  file_size: 2048,
  status: "uploaded",
  created_at: "2026-07-16T00:00:00Z",
  updated_at: "2026-07-16T00:00:00Z",
  last_read_at: null,
};

function documentList(items = [document]) {
  return { items, total: items.length, limit: 50, offset: 0 };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DocumentLibrary", () => {
  it("renders the empty library state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResponse(documentList([]))));

    render(<DocumentLibrary />);

    expect(await screen.findByText("Your library is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload a PDF" })).toHaveAttribute("href", "/upload");
  });

  it("renders documents returned by the backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResponse(documentList())));

    render(<DocumentLibrary />);

    const titles = await screen.findAllByText("Project Brief");
    expect(titles.length).toBeGreaterThan(0);
    expect(screen.getAllByText("uploaded").length).toBeGreaterThan(0);
  });

  it("renames a document and refreshes the list", async () => {
    const renamed = { ...document, title: "Renamed Brief" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiResponse(documentList()))
      .mockResolvedValueOnce(apiResponse({ ...renamed, versions: [], processing_jobs: [] }))
      .mockResolvedValueOnce(apiResponse(documentList([renamed])));
    vi.stubGlobal("fetch", fetchMock);
    render(<DocumentLibrary />);

    await screen.findAllByText("Project Brief");
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Rename Project Brief"), {
      target: { value: "Renamed Brief" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const renamedTitles = await screen.findAllByText("Renamed Brief");
    expect(renamedTitles.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("requires confirmation before deleting and refreshes the list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiResponse(documentList()))
      .mockResolvedValueOnce(apiResponse(null, 204))
      .mockResolvedValueOnce(apiResponse(documentList([])));
    vi.stubGlobal("fetch", fetchMock);
    render(<DocumentLibrary />);

    await screen.findAllByText("Project Brief");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete document" }));

    await waitFor(() => expect(screen.getByText("Your library is empty")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});


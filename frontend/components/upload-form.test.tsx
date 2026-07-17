import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UploadForm } from "./upload-form";

function apiResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const uploadedDocument = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Research Notes",
  original_filename: "Research Notes.pdf",
  source_type: "pdf",
  mime_type: "application/pdf",
  file_size: 32,
  status: "uploaded",
  created_at: "2026-07-16T00:00:00Z",
  updated_at: "2026-07-16T00:00:00Z",
  last_read_at: null,
  versions: [],
  processing_jobs: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UploadForm", () => {
  it("rejects a file that is not a PDF", () => {
    render(<UploadForm />);
    const input = screen.getByLabelText("Choose PDF file");
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByRole("alert")).toHaveTextContent("Choose a PDF file.");
    expect(screen.getByRole("button", { name: "Upload PDF" })).toBeDisabled();
  });

  it("shows success after a PDF upload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiResponse(uploadedDocument, 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadForm />);
    const file = new File(["%PDF-1.4"], "Research Notes.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(screen.getByLabelText("Choose PDF file"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload PDF" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Upload complete"));
    expect(screen.getByRole("link", { name: "Open Library" })).toHaveAttribute(
      "href",
      "/library",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the API error when upload fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiResponse({ detail: "Document storage operation failed" }, 503)),
    );
    render(<UploadForm />);
    const file = new File(["%PDF-1.4"], "report.pdf", { type: "application/pdf" });

    fireEvent.change(screen.getByLabelText("Choose PDF file"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload PDF" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Document storage operation failed"),
    );
  });
});


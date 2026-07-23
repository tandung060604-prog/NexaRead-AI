import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/i18n";

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
  source_url: null,
  mime_type: "application/pdf",
  file_size: 32,
  collection_id: "22222222-2222-2222-2222-222222222222",
  layout_type: "PAPER",
  layout_override: null,
  document_type_override: "RESEARCH_PAPER",
  status: "SAFETY_CHECK",
  created_at: "2026-07-16T00:00:00Z",
  updated_at: "2026-07-16T00:00:00Z",
  last_read_at: null,
  archived_at: null,
  cover_url: "/api/documents/11111111-1111-1111-1111-111111111111/cover",
  versions: [],
  processing_jobs: [],
  processing_result: null,
};

const processedDocument = {
  ...uploadedDocument,
  status: "AI_READY",
  processing_result: {
    detected_document_type: "RESEARCH_PAPER",
    effective_document_type: "RESEARCH_PAPER",
    document_type_override: "RESEARCH_PAPER",
    language: "en",
    source_page_count: 12,
    chapter_count: 4,
    layout_quality: "GOOD",
    layout_quality_score: 0.94,
    warnings: [],
  },
};

const completeProcessingStatus = {
  document_id: uploadedDocument.id,
  status: "AI_READY",
  stage: "COMPLETE",
  progress: 100,
  error_code: null,
  error_message: null,
  page_count: 12,
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

const collections = [
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "AI Research",
    document_count: 2,
    created_at: "2026-07-16T00:00:00Z",
    updated_at: "2026-07-16T00:00:00Z",
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function clickButton(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

async function reachFileReview(file: File) {
  fireEvent.change(
    screen.getByLabelText(translate("vi", "upload", "chooseFileLabel")),
    { target: { files: [file] } },
  );
  clickButton(translate("vi", "upload", "actions.continue"));
  clickButton(translate("vi", "upload", "actions.continue"));
  fireEvent.change(
    screen.getByLabelText(translate("vi", "upload", "type.label")),
    { target: { value: "RESEARCH_PAPER" } },
  );
  clickButton(translate("vi", "upload", "actions.continue"));
  await screen.findByRole("option", { name: "AI Research" });
  fireEvent.change(
    screen.getByLabelText(translate("vi", "upload", "collection.label")),
    { target: { value: collections[0].id } },
  );
  clickButton(translate("vi", "upload", "actions.review"));
}

describe("UploadForm", () => {
  it("rejects an unsupported file with recovery guidance", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResponse([])));
    render(<UploadForm />);
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });

    fireEvent.change(
      screen.getByLabelText(translate("vi", "upload", "chooseFileLabel")),
      { target: { files: [file] } },
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      translate("vi", "upload", "validation.type"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      translate("vi", "upload", "validation.guidance"),
    );
  });

  it("supports drag-and-drop and previews file information", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResponse([])));
    render(<UploadForm />);
    const file = new File(["%PDF-1.4"], "Dropped Report.pdf", {
      type: "application/pdf",
    });

    fireEvent.drop(
      screen.getByRole("button", {
        name: translate("vi", "upload", "dropzoneLabel"),
      }),
      { dataTransfer: { files: [file] } },
    );
    clickButton(translate("vi", "upload", "actions.continue"));

    expect(screen.getByRole("heading", {
      name: translate("vi", "upload", "info.title"),
    })).toBeInTheDocument();
    expect(screen.getByText("Dropped Report.pdf")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("uploads with selected metadata, previews the result, and starts reading", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiResponse(collections))
      .mockResolvedValueOnce(apiResponse(uploadedDocument, 201))
      .mockResolvedValueOnce(apiResponse(completeProcessingStatus))
      .mockResolvedValueOnce(apiResponse(processedDocument));
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadForm />);

    await reachFileReview(
      new File(["%PDF-1.4"], "Research Notes.pdf", {
        type: "application/pdf",
      }),
    );
    clickButton(translate("vi", "upload", "submit"));

    await waitFor(() => expect(screen.getByRole("heading", {
      name: translate("vi", "upload", "preview.title"),
    })).toBeInTheDocument());
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("en")).toBeInTheDocument();

    const uploadInit = fetchMock.mock.calls[1][1] as RequestInit;
    const formData = uploadInit.body as FormData;
    expect(formData.get("document_type_override")).toBe("RESEARCH_PAPER");
    expect(formData.get("collection_id")).toBe(collections[0].id);

    clickButton(translate("vi", "upload", "actions.continueToRead"));
    expect(screen.getByRole("link", {
      name: translate("vi", "upload", "ready.startReading"),
    })).toHaveAttribute(
      "href",
      `/documents/${uploadedDocument.id}/read`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("imports a URL and gives concrete OCR guidance", async () => {
    const imported = {
      ...uploadedDocument,
      source_type: "url",
      source_url: "https://example.com/article",
      original_filename: "example.com.html",
      document_type_override: "WEB_ARTICLE",
    };
    const ocrStatus = {
      ...completeProcessingStatus,
      status: "OCR_REQUIRED",
      stage: "OCR_REQUIRED",
      error_code: "OCR_REQUIRED",
      page_count: null,
      completed_stages: ["UPLOADING", "SAFETY_CHECK", "EXTRACTING"],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiResponse([]))
      .mockResolvedValueOnce(apiResponse(imported, 201))
      .mockResolvedValueOnce(apiResponse(ocrStatus))
      .mockResolvedValueOnce(apiResponse(imported));
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadForm />);

    clickButton(translate("vi", "upload", "source.url"));
    fireEvent.change(
      screen.getByLabelText(translate("vi", "upload", "urlLabel")),
      { target: { value: "https://example.com/article" } },
    );
    clickButton(translate("vi", "upload", "actions.continue"));
    clickButton(translate("vi", "upload", "actions.continue"));
    fireEvent.change(
      screen.getByLabelText(translate("vi", "upload", "type.label")),
      { target: { value: "WEB_ARTICLE" } },
    );
    clickButton(translate("vi", "upload", "actions.continue"));
    clickButton(translate("vi", "upload", "actions.review"));
    clickButton(translate("vi", "upload", "import"));

    await waitFor(() => expect(screen.getByRole("heading", {
      name: translate("vi", "upload", "ocr.title"),
    })).toBeInTheDocument());
    expect(screen.getByText(translate("vi", "upload", "ocr.step2"))).toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: translate("vi", "upload", "actions.continueToRead"),
    })).not.toBeInTheDocument();

    const importInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(importInit.body))).toEqual({
      url: "https://example.com/article",
      document_type_override: "WEB_ARTICLE",
      collection_id: null,
    });
  });

  it("keeps the review available and explains how to recover from an API error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiResponse(collections))
      .mockResolvedValueOnce(
        apiResponse({ detail: "Document storage operation failed" }, 503),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadForm />);

    await reachFileReview(
      new File(["%PDF-1.4"], "report.pdf", { type: "application/pdf" }),
    );
    clickButton(translate("vi", "upload", "submit"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(
      "Document storage operation failed",
    ));
    expect(screen.getByRole("alert")).toHaveTextContent(
      translate("vi", "upload", "validation.guidance"),
    );
    expect(screen.getByRole("heading", {
      name: translate("vi", "upload", "review.title"),
    })).toBeInTheDocument();
  });
});

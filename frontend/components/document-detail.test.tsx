import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/i18n";

import { DocumentDetail } from "./document-detail";

function apiResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const documentId = "11111111-1111-1111-1111-111111111111";
const completeStages = [
  "UPLOADING",
  "SAFETY_CHECK",
  "EXTRACTING",
  "STRUCTURING",
  "READABLE",
  "TOC",
  "INDEXING",
  "COMPLETE",
];
const detail = {
  id: documentId,
  title: "Layout Guide",
  original_filename: "layout-guide.pdf",
  source_type: "pdf",
  source_url: null,
  mime_type: "application/pdf",
  file_size: 4096,
  layout_type: "GENERAL_DOCUMENT",
  layout_override: null,
  document_type_override: null,
  status: "AI_READY",
  created_at: "2026-07-23T00:00:00Z",
  updated_at: "2026-07-23T00:00:00Z",
  last_read_at: null,
  versions: [{
    id: "22222222-2222-2222-2222-222222222222",
    version_number: 1,
    content_hash: "hash",
    page_count: 12,
    created_at: "2026-07-23T00:00:00Z",
  }],
  processing_jobs: [{
    id: "33333333-3333-3333-3333-333333333333",
    job_type: "document_processing",
    status: "COMPLETE",
    progress: 100,
    error_code: null,
    error_message: null,
    started_at: "2026-07-23T00:00:00Z",
    completed_at: "2026-07-23T00:01:00Z",
    created_at: "2026-07-23T00:00:00Z",
  }],
  processing_result: {
    detected_document_type: "OTHER",
    effective_document_type: "OTHER",
    document_type_override: null,
    language: "vi",
    source_page_count: 12,
    chapter_count: 3,
    layout_quality: "HIGH",
    layout_quality_score: 0.94,
    warnings: ["One ambiguous heading"],
  },
};
const status = {
  document_id: documentId,
  status: "AI_READY",
  stage: "COMPLETE",
  progress: 100,
  error_code: null,
  error_message: null,
  page_count: 12,
  completed_stages: completeStages,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DocumentDetail processing UX", () => {
  it("shows results, original/clean actions, warnings, and all stages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          apiResponse(url.endsWith("/processing-status") ? status : detail),
        ),
      ),
    );

    render(<DocumentDetail documentId={documentId} />);

    expect(await screen.findByText(
      translate("vi", "library", "detail.processingResult"),
    )).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("One ambiguous heading")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(9);
    expect(screen.getByRole("link", {
      name: translate("vi", "library", "detail.viewOriginal"),
    })).toHaveAttribute("href", `/api/documents/${documentId}/original`);
    expect(screen.getByRole("link", {
      name: translate("vi", "library", "detail.viewClean"),
    })).toHaveAttribute("href", `/documents/${documentId}/read`);
  });

  it("saves an override and starts a versioned reprocess", async () => {
    const overridden = {
      ...detail,
      layout_type: "PAPER",
      document_type_override: "RESEARCH_PAPER",
      processing_result: {
        ...detail.processing_result,
        effective_document_type: "RESEARCH_PAPER",
        document_type_override: "RESEARCH_PAPER",
      },
    };
    const reprocessing = {
      ...overridden,
      status: "SAFETY_CHECK",
      versions: [
        ...overridden.versions,
        { ...overridden.versions[0], id: "version-2", version_number: 2 },
      ],
    };
    const safetyStatus = {
      ...status,
      status: "SAFETY_CHECK",
      stage: "SAFETY_CHECK",
      progress: 10,
      completed_stages: ["UPLOADING"],
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/document-type") && init?.method === "PUT") {
        return Promise.resolve(apiResponse(overridden));
      }
      if (url.endsWith("/reprocess") && init?.method === "POST") {
        return Promise.resolve(apiResponse(reprocessing, 202));
      }
      if (url.endsWith("/processing-status")) {
        const reprocessCalled = fetchMock.mock.calls.some(
          ([calledUrl, calledInit]) =>
            String(calledUrl).endsWith("/reprocess")
            && (calledInit as RequestInit | undefined)?.method === "POST",
        );
        return Promise.resolve(apiResponse(reprocessCalled ? safetyStatus : status));
      }
      return Promise.resolve(apiResponse(detail));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DocumentDetail documentId={documentId} />);

    const typeSelect = await screen.findByLabelText(
      translate("vi", "library", "detail.overrideType"),
    );
    fireEvent.change(typeSelect, { target: { value: "RESEARCH_PAPER" } });
    await waitFor(() => expect(typeSelect).toHaveValue("RESEARCH_PAPER"));
    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "library", "detail.reprocess"),
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/documents/${documentId}/document-type`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ document_type_override: "RESEARCH_PAPER" }),
      }),
    ));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/documents/${documentId}/reprocess`,
      expect.objectContaining({ method: "POST" }),
    ));
    await waitFor(() => expect(screen.getAllByText(
      translate("vi", "reader", "processingStages.SAFETY_CHECK"),
    )).toHaveLength(2));
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContentBlock, TocItem } from "@/lib/documents-api";

import { ResearchReferencePanel } from "./research-reference-panel";

const baseBlock = {
  block_type: "PARAGRAPH",
  semantic_role: "paragraph",
  source_page_number: 1,
} as ContentBlock;

describe("ResearchReferencePanel", () => {
  afterEach(cleanup);

  it("offers abstract, section, and reference navigation", () => {
    const onNavigate = vi.fn();
    const blocks = [
      {
        ...baseBlock,
        block_type: "HEADING_1",
        id: "abstract-heading",
        text: "Abstract",
      },
      {
        ...baseBlock,
        id: "abstract-body",
        text: "This study evaluates grounded retrieval.",
      },
      {
        ...baseBlock,
        block_type: "HEADING_1",
        id: "methods",
        text: "Methods",
      },
      {
        ...baseBlock,
        id: "reference-1",
        semantic_role: "reference",
        source_page_number: 12,
        text: "[1] Source-grounded systems.",
      },
    ] as ContentBlock[];
    const toc = [
      {
        block_id: "methods",
        level: 1,
        page_number: 3,
        sequence_number: 2,
        title: "Methods",
      },
    ] satisfies TocItem[];

    render(
      <ResearchReferencePanel
        blocks={blocks}
        onNavigate={onNavigate}
        toc={toc}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "This study evaluates grounded retrieval.",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Methods/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /\[1\] Source-grounded systems/ }),
    );

    expect(onNavigate.mock.calls).toEqual([
      ["abstract-body"],
      ["methods"],
      ["reference-1"],
    ]);
  });
});

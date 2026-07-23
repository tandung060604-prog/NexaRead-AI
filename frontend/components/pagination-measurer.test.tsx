import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContentBlock } from "@/lib/documents-api";
import type { BlockMeasurementMap } from "@/lib/measured-pagination";

import { PaginationMeasurer } from "./pagination-measurer";

const block: ContentBlock = {
  id: "block-1",
  parent_block_id: null,
  sequence_number: 1,
  block_type: "PARAGRAPH",
  text: "First sentence. Second sentence.",
  source_text: "First sentence. Second sentence.",
  display_text: "First sentence. Second sentence.",
  transformation_log: [],
  transformation_confidence: 1,
  needs_review: false,
  source_anchor: { page_number: 1 },
  semantic_role: "paragraph",
  heading_level: null,
  keep_with_next: false,
  avoid_break_inside: false,
  break_before: false,
  break_after: false,
  indent_level: 0,
  text_align: "left",
  is_first_paragraph: false,
  is_chapter_opening: false,
  caption_for_asset_id: null,
  footnote_reference: null,
  source_page_number: 1,
  page_number: 1,
  chapter_index: null,
  section_index: null,
  paragraph_index: 1,
  start_offset: 0,
  end_offset: 32,
  bounding_box: [0, 0, 100, 20],
  font_name: null,
  font_size: null,
  is_bold: false,
  is_italic: false,
  confidence: 1,
  metadata: {},
  content_hash: "hash",
  created_at: "2026-07-23T00:00:00Z",
};

function rectangle(height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: 400,
    top: 0,
    width: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PaginationMeasurer", () => {
  it("renders in a hidden container and reports actual DOM range heights", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBounds(this: HTMLElement) {
        if (this.hasAttribute("data-measure-full")) return rectangle(126);
        if (this.hasAttribute("data-measure-range-block")) return rectangle(58);
        return rectangle(0);
      });
    const onMeasure = vi.fn<
      (measurements: BlockMeasurementMap, failed: boolean) => void
    >();

    const view = render(
      <PaginationMeasurer
        availableHeight={600}
        blocks={[block]}
        contentWidth={420}
        fontFamily="serif"
        fontSize={17}
        lineHeight={1.8}
        measurementKey="fixture"
        onMeasure={onMeasure}
      />,
    );

    await waitFor(() => expect(onMeasure).toHaveBeenCalled());
    const [measurements, failed] = onMeasure.mock.calls.at(-1) ?? [];
    expect(failed).toBe(false);
    expect(measurements?.get(block.id)?.height).toBe(126);
    expect(measurements?.get(block.id)?.ranges).toEqual([
      { startOffset: 0, endOffset: 16, height: 58 },
      { startOffset: 16, endOffset: block.text.length, height: 58 },
    ]);
    expect(view.container.firstElementChild).toHaveStyle({
      visibility: "hidden",
      position: "fixed",
      width: "420px",
    });
  });

  it("signals deterministic fallback when the DOM returns no dimensions", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue(rectangle(0));
    const onMeasure = vi.fn<
      (measurements: BlockMeasurementMap, failed: boolean) => void
    >();

    render(
      <PaginationMeasurer
        availableHeight={600}
        blocks={[block]}
        contentWidth={420}
        fontFamily="serif"
        fontSize={17}
        lineHeight={1.8}
        measurementKey="fallback"
        onMeasure={onMeasure}
      />,
    );

    await waitFor(() => expect(onMeasure).toHaveBeenCalled());
    expect(onMeasure.mock.calls.at(-1)?.[1]).toBe(true);
  });

  it("measures long documents in bounded DOM batches", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBounds(this: HTMLElement) {
        if (this.hasAttribute("data-measure-full")) return rectangle(72);
        if (this.hasAttribute("data-measure-range-block")) return rectangle(36);
        return rectangle(0);
      });
    const blocks = Array.from({ length: 130 }, (_, index) => ({
      ...block,
      id: `block-${index}`,
      sequence_number: index + 1,
      content_hash: `hash-${index}`,
    }));
    const onMeasure = vi.fn<
      (measurements: BlockMeasurementMap, failed: boolean) => void
    >();

    const view = render(
      <PaginationMeasurer
        availableHeight={600}
        blocks={blocks}
        contentWidth={420}
        fontFamily="serif"
        fontSize={17}
        lineHeight={1.8}
        measurementKey="long-document"
        onMeasure={onMeasure}
      />,
    );

    expect(
      view.container.querySelectorAll("[data-measure-full]").length,
    ).toBeLessThan(blocks.length);
    await waitFor(
      () => {
        expect(onMeasure).toHaveBeenCalled();
        expect(onMeasure.mock.calls.at(-1)?.[0].size).toBe(blocks.length);
      },
      { timeout: 2_000 },
    );
    expect(
      view.container.querySelectorAll("[data-measure-full]").length,
    ).toBeLessThanOrEqual(64);
  });
});

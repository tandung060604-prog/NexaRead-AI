"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ContentBlock } from "@/lib/documents-api";
import type { BlockMeasurementMap } from "@/lib/measured-pagination";
import {
  safeRangeCharacterLimit,
  safeTextRanges,
} from "@/lib/measured-pagination";

type PaginationMeasurerProps = {
  blocks: ContentBlock[];
  contentWidth: number;
  availableHeight: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  measurementKey: string;
  onMeasure: (measurements: BlockMeasurementMap, failed: boolean) => void;
};

const MEASUREMENT_BATCH_SIZE = 64;

function measurementStyle(block: ContentBlock): React.CSSProperties {
  if (block.block_type === "HEADING_1") {
    return { fontSize: "1.875em", fontWeight: 600, margin: "1.5rem 0 0.75rem" };
  }
  if (block.block_type === "HEADING_2") {
    return { fontSize: "1.5em", fontWeight: 600, margin: "1.25rem 0 0.5rem" };
  }
  if (block.block_type === "HEADING_3") {
    return { fontSize: "1.25em", fontWeight: 600, margin: "1rem 0 0.5rem" };
  }
  if (block.block_type === "LIST_ITEM") {
    return { margin: "0 0 0.25rem", paddingLeft: "1.75rem" };
  }
  if (block.block_type === "QUOTE") {
    return {
      borderLeft: "4px solid transparent",
      fontStyle: "italic",
      margin: "0.25rem 0 0.75rem",
      paddingLeft: "1.25rem",
    };
  }
  if (block.block_type === "CODE" || block.block_type === "TABLE") {
    return {
      fontFamily: "monospace",
      margin: "1.5rem 0",
      padding: "1rem",
      whiteSpace: "pre-wrap",
    };
  }
  if (block.block_type === "IMAGE") {
    return {
      height:
        typeof block.metadata.height === "number"
          ? `${block.metadata.height}px`
          : "min(45vh, 420px)",
      margin: "2rem 0",
    };
  }
  return { margin: "0 0 0.5rem" };
}

function blockText(block: ContentBlock, start = 0, end = block.text.length) {
  return block.block_type === "IMAGE" ? "\u00a0" : block.text.slice(start, end);
}

export function PaginationMeasurer({
  blocks,
  contentWidth,
  availableHeight,
  fontFamily,
  fontSize,
  lineHeight,
  measurementKey,
  onMeasure,
}: PaginationMeasurerProps) {
  const root = useRef<HTMLDivElement>(null);
  const [fontPass, setFontPass] = useState({ key: "", value: 0 });
  const activeFontPass =
    fontPass.key === measurementKey ? fontPass.value : 0;
  const passKey = `${measurementKey}:font-${activeFontPass}`;
  const measurableBlocks = useMemo(
    () => blocks.filter((block) => block.block_type !== "PAGE_BREAK"),
    [blocks],
  );
  const [batchState, setBatchState] = useState({ key: "", start: 0 });
  const batchStart = batchState.key === passKey ? batchState.start : 0;
  const batch = useMemo(
    () =>
      measurableBlocks.slice(
        batchStart,
        batchStart + MEASUREMENT_BATCH_SIZE,
      ),
    [batchStart, measurableBlocks],
  );
  const ranges = useMemo(
    () =>
      new Map(
        batch.map((block) => [
          block.id,
          safeTextRanges(
            block.text,
            safeRangeCharacterLimit({
              availableHeight,
              contentWidth,
              fontSize,
              lineHeight,
            }),
          ),
        ]),
      ),
    [availableHeight, batch, contentWidth, fontSize, lineHeight],
  );
  const accumulated = useRef<{
    key: string;
    output: BlockMeasurementMap;
    successfulMeasurements: number;
  }>({
    key: "",
    output: new Map(),
    successfulMeasurements: 0,
  });

  useEffect(() => {
    let cancelled = false;
    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (cancelled) return;
        setFontPass((current) =>
          current.key === measurementKey && current.value === 1
            ? current
            : { key: measurementKey, value: 1 },
        );
      });
    }
    return () => {
      cancelled = true;
    };
  }, [measurementKey]);

  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    if (accumulated.current.key !== passKey) {
      accumulated.current = {
        key: passKey,
        output: new Map(),
        successfulMeasurements: 0,
      };
    }
    for (const block of batch) {
      const full = container.querySelector<HTMLElement>(
        `[data-measure-full="${CSS.escape(block.id)}"]`,
      );
      const height = full?.getBoundingClientRect().height ?? 0;
      if (height > 0) accumulated.current.successfulMeasurements += 1;
      const measuredRanges = Array.from(
        container.querySelectorAll<HTMLElement>(
          `[data-measure-range-block="${CSS.escape(block.id)}"]`,
        ),
      ).map((element) => ({
        startOffset: Number(element.dataset.rangeStart ?? 0),
        endOffset: Number(element.dataset.rangeEnd ?? 0),
        height: element.getBoundingClientRect().height,
      }));
      accumulated.current.output.set(block.id, {
        blockId: block.id,
        height,
        ranges: measuredRanges,
      });
    }

    const nextStart = batchStart + batch.length;
    if (nextStart >= measurableBlocks.length) {
      const output = new Map(accumulated.current.output);
      onMeasure(
        output,
        output.size > 0
          && accumulated.current.successfulMeasurements === 0,
      );
      return;
    }

    const frame = requestAnimationFrame(() => {
      setBatchState({ key: passKey, start: nextStart });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [
    batch,
    batchStart,
    contentWidth,
    fontFamily,
    fontSize,
    lineHeight,
    measurableBlocks.length,
    onMeasure,
    passKey,
  ]);

  return (
    <div
      aria-hidden="true"
      ref={root}
      style={{
        contain: "layout style",
        fontFamily,
        fontSize: `${fontSize}px`,
        left: "-100000px",
        lineHeight,
        pointerEvents: "none",
        position: "fixed",
        top: 0,
        visibility: "hidden",
        width: `${Math.max(1, contentWidth)}px`,
        zIndex: -1,
      }}
    >
      {batch.map((block) => (
          <div key={block.id}>
            <div
              data-measure-full={block.id}
              style={measurementStyle(block)}
            >
              {blockText(block)}
            </div>
            {(ranges.get(block.id) ?? []).map((range) => (
              <div
                data-measure-range-block={block.id}
                data-range-end={range.endOffset}
                data-range-start={range.startOffset}
                key={`${block.id}:${range.startOffset}:${range.endOffset}`}
                style={measurementStyle(block)}
              >
                {blockText(block, range.startOffset, range.endOffset)}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

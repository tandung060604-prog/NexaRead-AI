import { useVirtualizer } from "@tanstack/react-virtual";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useRef } from "react";

function VirtualizedFixture({ count }: { count: number }) {
  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count,
    estimateSize: () => 72,
    getScrollElement: () => parentRef.current,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();
  return (
    <div ref={parentRef} style={{ height: 600, overflow: "auto" }}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualItems.map((item) => (
          <div
            data-testid="benchmark-block"
            key={item.key}
            ref={virtualizer.measureElement}
            style={{ position: "absolute", transform: `translateY(${item.start}px)` }}
          >
            Block {item.index}
          </div>
        ))}
      </div>
    </div>
  );
}

afterEach(cleanup);

describe("reader virtualization benchmark", () => {
  for (const count of [100, 1_000, 5_000]) {
    it(`keeps the mounted window bounded for ${count.toLocaleString()} blocks`, async () => {
      const startedAt = performance.now();
      const view = render(<VirtualizedFixture count={count} />);

      await waitFor(() => {
        const mounted = view.queryAllByTestId("benchmark-block").length;
        expect(mounted).toBeGreaterThan(0);
        expect(mounted).toBeLessThan(count);
      });
      expect(performance.now() - startedAt).toBeLessThan(1_000);
    });
  }
});

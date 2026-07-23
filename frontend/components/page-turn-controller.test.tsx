import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/i18n";

import { PageTurnController } from "./page-turn-controller";

afterEach(cleanup);

function renderController(
  onPageChange = vi.fn(),
  options: { animationEnabled?: boolean; reducedMotion?: boolean } = {},
) {
  render(
    <PageTurnController
      animationEnabled={options.animationEnabled ?? false}
      currentPage={2}
      keyboardActive={true}
      onPageChange={onPageChange}
      pagesPerSpread={2}
      reducedMotion={options.reducedMotion ?? false}
      totalPages={10}
    >
      <div>Pages</div>
    </PageTurnController>,
  );
  return onPageChange;
}

describe("PageTurnController", () => {
  it("supports arrows, PageUp/PageDown, Home, and End", () => {
    const onPageChange = renderController();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onPageChange).toHaveBeenLastCalledWith(4, "forward");
    fireEvent.keyDown(window, { key: "PageUp" });
    expect(onPageChange).toHaveBeenLastCalledWith(0, "backward");
    fireEvent.keyDown(window, { key: "Home" });
    expect(onPageChange).toHaveBeenLastCalledWith(0, "backward");
    fireEvent.keyDown(window, { key: "End" });
    expect(onPageChange).toHaveBeenLastCalledWith(8, "forward");
  });

  it("supports horizontal swipe and exposes large labeled controls", () => {
    const onPageChange = renderController();
    const region = screen.getByRole("region", {
      name: translate("vi", "reader", "bookRegion"),
    });

    fireEvent.touchStart(region, {
      touches: [{ clientX: 180, clientY: 100 }],
    });
    fireEvent.touchEnd(region, {
      changedTouches: [{ clientX: 80, clientY: 105 }],
    });

    expect(onPageChange).toHaveBeenLastCalledWith(4, "forward");
    vi.spyOn(region, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 300,
      top: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.click(region, { clientX: 295 });
    expect(onPageChange).toHaveBeenLastCalledWith(4, "forward");
    expect(screen.getByRole("button", {
      name: translate("vi", "reader", "previousPage"),
    })).toHaveClass("size-11");
    expect(region).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowLeft ArrowRight PageUp PageDown Home End",
    );
  });

  it("turns immediately when reduced motion is enabled", () => {
    const onPageChange = renderController(vi.fn(), {
      animationEnabled: true,
      reducedMotion: true,
    });

    fireEvent.click(screen.getByRole("button", {
      name: translate("vi", "reader", "nextPage"),
    }));

    expect(onPageChange).toHaveBeenCalledWith(4, "forward");
  });

  it("keeps page-turn input responsive for long books", () => {
    const onPageChange = vi.fn();
    render(
      <PageTurnController
        animationEnabled={false}
        currentPage={50_000}
        keyboardActive={true}
        onPageChange={onPageChange}
        pagesPerSpread={2}
        reducedMotion={false}
        totalPages={100_000}
      >
        <div>Long book pages</div>
      </PageTurnController>,
    );
    const startedAt = performance.now();

    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(onPageChange).toHaveBeenCalledWith(50_002, "forward");
    expect(performance.now() - startedAt).toBeLessThan(100);
  });
});

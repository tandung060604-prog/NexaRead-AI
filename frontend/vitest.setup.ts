import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

class TestResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    const height = target.hasAttribute("data-index") ? 76 : 600;
    queueMicrotask(() => this.callback(
      [
        {
          target,
          contentRect: {
            bottom: height,
            height,
            left: 0,
            right: 900,
            top: 0,
            width: 900,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          },
          borderBoxSize: [{ blockSize: height, inlineSize: 900 }],
          contentBoxSize: [{ blockSize: height, inlineSize: 900 }],
          devicePixelContentBoxSize: [{ blockSize: height, inlineSize: 900 }],
        } as ResizeObserverEntry,
      ],
      this,
    ));
  }

  disconnect() {}
  unobserve() {}
}

vi.stubGlobal("ResizeObserver", TestResizeObserver);

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value(options: ScrollToOptions | number, y?: number) {
    this.scrollTop = typeof options === "number" ? (y ?? 0) : (options.top ?? 0);
    this.dispatchEvent(new Event("scroll"));
  },
});

Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value() {
    const height = this.hasAttribute("data-index") ? 76 : 600;
    return {
      bottom: height,
      height,
      left: 0,
      right: 900,
      top: 0,
      width: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  },
});

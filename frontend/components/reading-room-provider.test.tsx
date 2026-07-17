import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReadingRoomProvider, useReadingRoom } from "./reading-room-provider";

function Probe() {
  const { reducedMotion, roomSelectorOpen } = useReadingRoom();
  return (
    <div>
      <span>{reducedMotion ? "reduced" : "full"}</span>
      <span>{roomSelectorOpen ? "selector-open" : "selector-closed"}</span>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ReadingRoomProvider", () => {
  it("initializes motion and first-visit selector without effect-driven state", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    render(
      <ReadingRoomProvider>
        <Probe />
      </ReadingRoomProvider>,
    );

    expect(screen.getByText("reduced")).toBeInTheDocument();
    expect(screen.getByText("selector-open")).toBeInTheDocument();
  });

  it("keeps the selector closed for a previously selected room", () => {
    window.localStorage.setItem(
      "nexaread:immersive:preferences",
      JSON.stringify({ selectedRoom: "rainy-window" }),
    );
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    render(
      <ReadingRoomProvider>
        <Probe />
      </ReadingRoomProvider>,
    );

    expect(screen.getByText("full")).toBeInTheDocument();
    expect(screen.getByText("selector-closed")).toBeInTheDocument();
  });
});

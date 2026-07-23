import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/i18n";

import { ReaderExperience } from "./reader-experience";

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    "nexaread:immersive:preferences",
    JSON.stringify({ selectedRoom: "minimal-focus" }),
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ReaderExperience", () => {
  it("opens an accessible reading-room dialog and restores focus", () => {
    render(
      <ReaderExperience>
        <p>Reader content</p>
      </ReaderExperience>,
    );
    const trigger = screen.getByRole("button", {
      name: translate("vi", "reader", "room.openSelector"),
    });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: translate("vi", "reader", "room.dialog"),
    });
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: translate("vi", "reader", "room.close"),
      }),
    ).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps ambient audio off until the user explicitly enables it", () => {
    render(
      <ReaderExperience>
        <p>Reader content</p>
      </ReaderExperience>,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: translate("vi", "reader", "audio.mixer"),
      }),
    );
    const enable = screen.getByRole("button", {
      name: translate("vi", "reader", "audio.enableAmbient"),
    });
    expect(enable).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(enable);
    expect(
      screen.getByRole("button", {
        name: translate("vi", "reader", "audio.disableAmbient"),
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("remembers a first-visit room selector dismissal", () => {
    window.localStorage.clear();
    const view = render(
      <ReaderExperience>
        <p>Reader content</p>
      </ReaderExperience>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: `${translate("vi", "reader", "room.skip")} →`,
      }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      JSON.parse(
        window.localStorage.getItem(
          "nexaread:immersive:preferences",
        ) ?? "{}",
      ),
    ).toMatchObject({ selectedRoom: "minimal-focus" });
    view.unmount();

    render(
      <ReaderExperience>
        <p>Reader content again</p>
      </ReaderExperience>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

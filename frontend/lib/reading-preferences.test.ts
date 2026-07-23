import { beforeEach, describe, expect, it } from "vitest";

import {
  loadImmersivePreferences,
  normalizeReadingMode,
} from "./reading-preferences";

beforeEach(() => {
  window.localStorage.clear();
});

describe("reading mode preferences", () => {
  it("normalizes legacy modes to the four canonical reader modes", () => {
    expect(normalizeReadingMode("pdf")).toBe("original");
    expect(normalizeReadingMode("scroll")).toBe("clean");
    expect(normalizeReadingMode("standard")).toBe("clean");
    expect(normalizeReadingMode("book")).toBe("book");
    expect(normalizeReadingMode("study")).toBe("study");
  });

  it("migrates a locally persisted legacy mode on load", () => {
    window.localStorage.setItem(
      "nexaread:immersive:preferences",
      JSON.stringify({ readingMode: "pdf" }),
    );

    expect(loadImmersivePreferences().readingMode).toBe("original");
  });

  it("keeps ambient and page-turn audio off by default", () => {
    const preferences = loadImmersivePreferences();

    expect(preferences.ambientEnabled).toBe(false);
    expect(preferences.pageTurnSoundEnabled).toBe(false);
  });
});

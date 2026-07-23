import { describe, expect, it } from "vitest";

import {
  getDocumentReadingDefaults,
  resolveReaderFontFamily,
} from "./reader-personalization";

describe("reader personalization", () => {
  it("uses book typography, paged mode, and chapter navigation", () => {
    expect(getDocumentReadingDefaults("BOOK")).toMatchObject({
      navigationStyle: "chapter",
      preferences: {
        font_family: "serif",
        reading_width: 720,
        theme: "sepia",
      },
      readingMode: "book",
    });
  });

  it("uses clean research layout with references and section navigation", () => {
    expect(getDocumentReadingDefaults("research_paper")).toMatchObject({
      navigationStyle: "section",
      preferredTool: "references",
      preferences: {
        font_family: "sans",
        reading_width: 800,
      },
      readingMode: "clean",
    });
  });

  it("uses a code-friendly technical width and the terminology panel", () => {
    expect(getDocumentReadingDefaults("TECHNICAL")).toMatchObject({
      preferredTool: "keywords",
      preferences: {
        font_family: "sans",
        reading_width: 860,
      },
    });
  });

  it("uses legal navigation without changing source structure", () => {
    expect(getDocumentReadingDefaults("LEGAL")).toMatchObject({
      navigationStyle: "legal",
      preferences: { reading_width: 820 },
      readingMode: "clean",
    });
    expect(getDocumentReadingDefaults("REPORT")).toBeNull();
  });

  it("resolves explicit font-family preferences", () => {
    expect(resolveReaderFontFamily("serif", "preset")).toContain("Georgia");
    expect(resolveReaderFontFamily("dyslexic", "preset")).toContain(
      "OpenDyslexic",
    );
    expect(resolveReaderFontFamily("sans", "preset")).toBe("preset");
  });
});

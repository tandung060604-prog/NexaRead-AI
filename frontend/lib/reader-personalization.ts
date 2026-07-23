import type { ReadingPreferencesInput } from "./documents-api";
import type { ReadingMode } from "./reading-preferences";

export type ReaderToolPreference = "chat" | "references" | "keywords";
export type ReaderNavigationStyle = "chapter" | "section" | "legal";

export type DocumentReadingDefaults = {
  preferences: Partial<ReadingPreferencesInput>;
  readingMode: ReadingMode;
  preferredTool: ReaderToolPreference;
  navigationStyle: ReaderNavigationStyle;
};

const BOOK_DEFAULTS: DocumentReadingDefaults = {
  navigationStyle: "chapter",
  preferredTool: "chat",
  preferences: {
    font_family: "serif",
    font_size: 18,
    line_height: 1.85,
    reading_width: 720,
    theme: "sepia",
  },
  readingMode: "book",
};

const PAPER_DEFAULTS: DocumentReadingDefaults = {
  navigationStyle: "section",
  preferredTool: "references",
  preferences: {
    font_family: "sans",
    font_size: 16,
    line_height: 1.7,
    reading_width: 800,
    theme: "light",
  },
  readingMode: "clean",
};

const TECHNICAL_DEFAULTS: DocumentReadingDefaults = {
  navigationStyle: "section",
  preferredTool: "keywords",
  preferences: {
    font_family: "sans",
    font_size: 16,
    line_height: 1.7,
    reading_width: 860,
    theme: "light",
  },
  readingMode: "clean",
};

const LEGAL_DEFAULTS: DocumentReadingDefaults = {
  navigationStyle: "legal",
  preferredTool: "chat",
  preferences: {
    font_family: "sans",
    font_size: 17,
    line_height: 1.85,
    reading_width: 820,
    theme: "light",
  },
  readingMode: "clean",
};

export function getDocumentReadingDefaults(
  documentType: string | null | undefined,
): DocumentReadingDefaults | null {
  switch (documentType?.trim().toUpperCase()) {
    case "BOOK":
    case "TEXTBOOK":
      return BOOK_DEFAULTS;
    case "RESEARCH_PAPER":
    case "THESIS":
      return PAPER_DEFAULTS;
    case "TECHNICAL":
      return TECHNICAL_DEFAULTS;
    case "LEGAL":
      return LEGAL_DEFAULTS;
    default:
      return null;
  }
}

export function resolveReaderFontFamily(
  family: ReadingPreferencesInput["font_family"],
  presetFamily: string,
): string {
  if (family === "serif") {
    return "'Source Serif 4', Georgia, 'Times New Roman', serif";
  }
  if (family === "dyslexic") {
    return "OpenDyslexic, Atkinson Hyperlegible, system-ui, sans-serif";
  }
  return presetFamily;
}

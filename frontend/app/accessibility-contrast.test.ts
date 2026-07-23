import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { READING_ROOMS } from "@/config/reading-rooms";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

function declarations(selector: string): Record<string, string> {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`Missing CSS selector: ${selector}`);
  const end = css.indexOf("}", start);
  if (end < 0) throw new Error(`Unclosed CSS selector: ${selector}`);
  return Object.fromEntries(
    [...css.slice(start, end).matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)]
      .map((match) => [match[1], match[2]]),
  );
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16) / 255
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort(
    (left, right) => right - left,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("WCAG AA color tokens", () => {
  const app = declarations(":root");
  const publicDark = declarations(".public-shell");
  const publicLight = {
    ...publicDark,
    ...declarations('.public-shell[data-public-theme="light"]'),
  };
  const readerLight = declarations(".reader-theme");
  const readerSepia = {
    ...readerLight,
    ...declarations('.reader-theme[data-theme="sepia"]'),
  };
  const readerDark = {
    ...readerLight,
    ...declarations('.reader-theme[data-theme="dark"]'),
  };
  const cases: Array<[string, string, string]> = [
    ["app foreground", app.foreground, app.background],
    ["app muted", app.muted, app.background],
    ["app CTA", "#ffffff", app.accent],
    ["public dark foreground", publicDark.foreground, publicDark.background],
    ["public dark muted", publicDark.muted, publicDark.background],
    ["public dark CTA", "#ffffff", publicDark.accent],
    ["public light foreground", publicLight.foreground, publicLight.background],
    ["public light muted", publicLight.muted, publicLight.background],
    ["public light CTA", "#ffffff", publicLight.accent],
    [
      "reader light foreground",
      readerLight["reader-foreground"],
      readerLight["reader-background"],
    ],
    [
      "reader light muted",
      readerLight["reader-muted"],
      readerLight["reader-background"],
    ],
    [
      "reader light accent button",
      readerLight["reader-accent-foreground"],
      readerLight["reader-accent"],
    ],
    [
      "reader sepia foreground",
      readerSepia["reader-foreground"],
      readerSepia["reader-background"],
    ],
    [
      "reader sepia muted",
      readerSepia["reader-muted"],
      readerSepia["reader-background"],
    ],
    [
      "reader sepia accent button",
      readerSepia["reader-accent-foreground"],
      readerSepia["reader-accent"],
    ],
    [
      "reader dark foreground",
      readerDark["reader-foreground"],
      readerDark["reader-background"],
    ],
    [
      "reader dark muted",
      readerDark["reader-muted"],
      readerDark["reader-background"],
    ],
    [
      "reader dark accent button",
      readerDark["reader-accent-foreground"],
      readerDark["reader-accent"],
    ],
  ];

  it.each(cases)("%s reaches 4.5:1", (_, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(READING_ROOMS)(
    "$id room accent reaches 4.5:1",
    ({ accent, accentForeground }) => {
      expect(contrast(accentForeground, accent)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

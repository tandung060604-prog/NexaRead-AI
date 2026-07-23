import { describe, expect, it } from "vitest";

import enAuth from "@/locales/en/auth.json";
import enChat from "@/locales/en/chat.json";
import enCommon from "@/locales/en/common.json";
import enErrors from "@/locales/en/errors.json";
import enLanding from "@/locales/en/landing.json";
import enLibrary from "@/locales/en/library.json";
import enPersonalization from "@/locales/en/personalization.json";
import enReader from "@/locales/en/reader.json";
import enUpload from "@/locales/en/upload.json";
import viAuth from "@/locales/vi/auth.json";
import viChat from "@/locales/vi/chat.json";
import viCommon from "@/locales/vi/common.json";
import viErrors from "@/locales/vi/errors.json";
import viLanding from "@/locales/vi/landing.json";
import viLibrary from "@/locales/vi/library.json";
import viPersonalization from "@/locales/vi/personalization.json";
import viReader from "@/locales/vi/reader.json";
import viUpload from "@/locales/vi/upload.json";

import {
  DEFAULT_LOCALE,
  DEFAULT_TIME_ZONE,
  formatLocaleDate,
  formatLocaleNumber,
  isLocale,
  translate,
} from "./i18n";

type MessageTree = { [key: string]: string | MessageTree };

function keyPaths(tree: MessageTree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : keyPaths(value, path);
  }).sort();
}

describe("i18n", () => {
  it("defaults to Vietnamese and falls back to Vietnamese messages", () => {
    expect(DEFAULT_LOCALE).toBe("vi");
    expect(isLocale("vi")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(translate("vi", "common", "nav.library")).toBe("Thư viện");
    expect(translate("en", "common", "nav.library")).toBe("Library");
    expect(translate("en", "common", "missing")).toBe("common.missing");
  });

  it("formats dates in the Ho Chi Minh timezone and numbers by locale", () => {
    expect(DEFAULT_TIME_ZONE).toBe("Asia/Ho_Chi_Minh");
    expect(
      formatLocaleDate("2026-07-23T17:00:00Z", "vi", {
        dateStyle: "short",
        timeStyle: "short",
      }),
    ).toContain("24/7/26");
    expect(formatLocaleNumber(1234.5, "vi")).toBe("1.234,5");
    expect(formatLocaleNumber(1234.5, "en")).toBe("1,234.5");
  });

  it("keeps Vietnamese and English domain dictionaries structurally aligned", () => {
    const domains: Array<[MessageTree, MessageTree]> = [
      [viCommon, enCommon],
      [viAuth, enAuth],
      [viErrors, enErrors],
      [viLibrary, enLibrary],
      [viUpload, enUpload],
      [viReader, enReader],
      [viChat, enChat],
      [viLanding, enLanding],
      [viPersonalization, enPersonalization],
    ];

    for (const [viMessages, enMessages] of domains) {
      expect(keyPaths(viMessages)).toEqual(keyPaths(enMessages));
    }
  });
});

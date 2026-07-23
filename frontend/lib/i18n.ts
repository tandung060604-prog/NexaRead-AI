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

export const SUPPORTED_LOCALES = ["vi", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type TranslationDomain =
  | "common"
  | "auth"
  | "landing"
  | "library"
  | "upload"
  | "reader"
  | "chat"
  | "personalization"
  | "errors";

type MessageTree = { [key: string]: string | MessageTree };
type Dictionaries = Record<Locale, Record<TranslationDomain, MessageTree>>;

export const DEFAULT_LOCALE: Locale = "vi";
export const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";

const dictionaries: Dictionaries = {
  vi: {
    common: viCommon,
    auth: viAuth,
    landing: viLanding,
    library: viLibrary,
    upload: viUpload,
    reader: viReader,
    chat: viChat,
    personalization: viPersonalization,
    errors: viErrors,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    landing: enLanding,
    library: enLibrary,
    upload: enUpload,
    reader: enReader,
    chat: enChat,
    personalization: enPersonalization,
    errors: enErrors,
  },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as Locale);
}

function resolveMessage(
  locale: Locale,
  domain: TranslationDomain,
  key: string,
): string | undefined {
  let current: string | MessageTree | undefined = dictionaries[locale][domain];
  for (const segment of key.split(".")) {
    if (typeof current === "string") return undefined;
    current = current[segment];
    if (current === undefined) return undefined;
  }
  return typeof current === "string" ? current : undefined;
}

export function translate(
  locale: Locale,
  domain: TranslationDomain,
  key: string,
  values: Record<string, string | number> = {},
): string {
  const message =
    resolveMessage(locale, domain, key)
    ?? resolveMessage(DEFAULT_LOCALE, domain, key)
    ?? `${domain}.${key}`;
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    message,
  );
}

export function localeTag(locale: Locale): string {
  return locale === "vi" ? "vi-VN" : "en-US";
}

export function formatLocaleDate(
  value: Date | string | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: DEFAULT_TIME_ZONE,
    ...options,
  }).format(new Date(value));
}

export function formatLocaleNumber(
  value: number,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(localeTag(locale), options).format(value);
}

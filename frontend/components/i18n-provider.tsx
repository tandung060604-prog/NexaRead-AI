"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/components/auth-provider";
import {
  DEFAULT_LOCALE,
  formatLocaleDate,
  formatLocaleNumber,
  isLocale,
  translate,
  type Locale,
  type TranslationDomain,
} from "@/lib/i18n";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (
    domain: TranslationDomain,
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  formatDate: (
    value: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const fallbackValue: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: (domain, key, values) => translate(DEFAULT_LOCALE, domain, key, values),
  formatDate: (value, options) => formatLocaleDate(value, DEFAULT_LOCALE, options),
  formatNumber: (value, options) => formatLocaleNumber(value, DEFAULT_LOCALE, options),
};

const I18nContext = createContext<I18nContextValue>(fallbackValue);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [anonymousLocale, setAnonymousLocale] = useState<Locale>(DEFAULT_LOCALE);
  const locale = isLocale(user?.preferred_locale)
    ? user.preferred_locale
    : anonymousLocale;

  const setLocale = useCallback((nextLocale: Locale) => {
    setAnonymousLocale(nextLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (domain, key, values) => translate(locale, domain, key, values),
      formatDate: (date, options) => formatLocaleDate(date, locale, options),
      formatNumber: (number, options) => formatLocaleNumber(number, locale, options),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

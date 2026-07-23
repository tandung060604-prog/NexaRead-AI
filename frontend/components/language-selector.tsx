"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { updatePreferredLocale } from "@/lib/auth-api";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { user, setUser } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  async function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale || updating) return;
    setUpdating(true);
    setError("");
    try {
      if (user) {
        const updatedUser = await updatePreferredLocale(nextLocale);
        setUser(updatedUser);
      }
      setLocale(nextLocale);
    } catch {
      setError(t("errors", "REQUEST_FAILED"));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className={compact ? "flex items-center" : "grid gap-2"}>
      <label className={compact ? "sr-only" : "text-sm text-[var(--muted)]"} htmlFor="locale-selector">
        {t("common", "locale.label")}
      </label>
      <select
        aria-label={t("common", "locale.label")}
        className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
        disabled={updating}
        id="locale-selector"
        onChange={(event) => void changeLocale(event.target.value as Locale)}
        value={locale}
      >
        {SUPPORTED_LOCALES.map((item) => (
          <option key={item} value={item}>
            {t("common", `locale.${item}`)}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : null}
      {updating ? <span className="sr-only">{t("common", "locale.updating")}</span> : null}
    </div>
  );
}

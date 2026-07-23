"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSelector } from "@/components/language-selector";

export default function AccountPage() {
  const { user, loading, logout } = useAuth();
  const { t } = useI18n();

  if (loading) return <p className="py-10">{t("common", "account.loading")}</p>;
  if (!user) return null;

  return (
    <section className="w-full max-w-3xl py-4">
      <p className="text-sm font-semibold uppercase text-[var(--accent)]">
        {t("common", "account.title")}
      </p>
      <h1 className="mt-3 text-3xl font-semibold">{user.display_name}</h1>
      <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-[var(--muted)]">
              {t("common", "account.email")}
            </dt>
            <dd className="mt-1 font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-[var(--muted)]">
              {t("common", "account.preferredLanguage")}
            </dt>
            <dd className="mt-2"><LanguageSelector /></dd>
          </div>
        </dl>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white"
            href="/account/sessions"
          >
            {t("common", "account.manageSessions")}
          </Link>
          <button
            className="rounded-lg border border-[var(--border)] px-5 py-3 text-sm font-semibold"
            onClick={() => void logout()}
            type="button"
          >
            {t("common", "nav.logout")}
          </button>
        </div>
      </div>
    </section>
  );
}

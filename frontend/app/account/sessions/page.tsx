"use client";

import { SessionManager } from "@/components/session-manager";
import { useI18n } from "@/components/i18n-provider";

export default function AccountSessionsPage() {
  const { t } = useI18n();
  return (
    <section className="w-full max-w-3xl py-4">
      <p className="text-sm font-semibold uppercase text-[var(--accent)]">
        {t("common", "account.security")}
      </p>
      <h1 className="mt-3 text-3xl font-semibold">
        {t("common", "account.sessions")}
      </h1>
      <p className="mt-3 text-[var(--muted)]">
        {t("common", "account.sessionsDescription")}
      </p>
      <SessionManager />
    </section>
  );
}

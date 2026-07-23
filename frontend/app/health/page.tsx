"use client";

import { useI18n } from "@/components/i18n-provider";

export default function HealthPage() {
  const { t } = useI18n();
  return (
    <section className="w-full py-8">
      <p className="text-sm font-semibold uppercase text-[var(--accent)]">
        {t("common", "health.eyebrow")}
      </p>
      <h1 className="mt-3 text-3xl font-semibold">{t("common", "health.title")}</h1>
      <div className="mt-8 flex max-w-xl items-center justify-between border border-[var(--border)] bg-[var(--surface)] p-5">
        <div>
          <p className="font-semibold">nexaread-web</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t("common", "health.application")}
          </p>
        </div>
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]">
          <span className="h-2.5 w-2.5 rounded-full bg-green-600" aria-hidden="true" />
          {t("common", "health.healthy")}
        </span>
      </div>
    </section>
  );
}


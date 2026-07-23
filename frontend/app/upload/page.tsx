"use client";

import { UploadForm } from "@/components/upload-form";
import { useI18n } from "@/components/i18n-provider";

export default function UploadPage() {
  const { t } = useI18n();
  return (
    <section className="w-full py-4">
      <p className="text-sm font-semibold uppercase text-[var(--accent)]">
        {t("upload", "eyebrow")}
      </p>
      <h1 className="mt-3 text-3xl font-semibold">{t("upload", "title")}</h1>
      <p className="mb-8 mt-3 max-w-2xl leading-7 text-[var(--muted)]">
        {t("upload", "description")}
      </p>
      <UploadForm />
    </section>
  );
}


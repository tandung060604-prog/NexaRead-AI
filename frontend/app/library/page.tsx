"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { DocumentLibrary } from "@/components/document-library";
import { useI18n } from "@/components/i18n-provider";

export default function LibraryPage() {
  const { t } = useI18n();
  return (
    <section className="w-full py-4">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase text-[var(--accent)]">
            {t("library", "eyebrow")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold">{t("library", "title")}</h1>
        </div>
        <Link className="bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white" href="/upload">
          {t("library", "uploadAction")}
        </Link>
      </div>
      <Suspense
        fallback={
          <div
            aria-label={t("library", "loading")}
            className="h-48 animate-pulse rounded-xl bg-[var(--surface-muted)]"
          />
        }
      >
        <FilteredDocumentLibrary />
      </Suspense>
    </section>
  );
}

function FilteredDocumentLibrary() {
  const searchParams = useSearchParams();
  return (
    <DocumentLibrary
      initialCollectionId={searchParams.get("collection_id") ?? ""}
    />
  );
}


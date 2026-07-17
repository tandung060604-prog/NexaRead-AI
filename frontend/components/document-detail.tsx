"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DocumentDetail as DocumentDetailType, fetchDocument } from "@/lib/documents-api";

type DocumentDetailProps = {
  documentId: string;
};

export function DocumentDetail({ documentId }: DocumentDetailProps) {
  const [document, setDocument] = useState<DocumentDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchDocument(documentId)
      .then((result) => {
        if (active) {
          setDocument(result);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Could not load document.");
        }
      });
    return () => {
      active = false;
    };
  }, [documentId]);

  if (error) {
    return <p className="border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-5" role="alert">{error}</p>;
  }
  if (!document) {
    return <div aria-label="Loading document" className="h-48 animate-pulse bg-[var(--surface-muted)]" />;
  }

  const createdAt = new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" }).format(
    new Date(document.created_at),
  );

  return (
    <div className="w-full">
      <Link className="text-sm font-semibold text-[var(--accent-strong)]" href="/library">
        Back to Library
      </Link>
      <h1 className="mt-5 text-3xl font-semibold">{document.title}</h1>
      <p className="mt-2 text-[var(--muted)]">{document.original_filename}</p>

      <dl className="mt-8 grid max-w-3xl grid-cols-1 border-y border-[var(--border)] sm:grid-cols-2">
        <div className="border-b border-[var(--border)] py-4 sm:pr-6">
          <dt className="text-xs font-semibold uppercase text-[var(--muted)]">Status</dt>
          <dd className="mt-1 font-semibold capitalize">{document.status}</dd>
        </div>
        <div className="border-b border-[var(--border)] py-4 sm:pl-6">
          <dt className="text-xs font-semibold uppercase text-[var(--muted)]">Created</dt>
          <dd className="mt-1">{createdAt}</dd>
        </div>
        <div className="py-4 sm:pr-6">
          <dt className="text-xs font-semibold uppercase text-[var(--muted)]">File size</dt>
          <dd className="mt-1">{(document.file_size / 1024).toFixed(1)} KB</dd>
        </div>
        <div className="py-4 sm:pl-6">
          <dt className="text-xs font-semibold uppercase text-[var(--muted)]">Version</dt>
          <dd className="mt-1">{document.versions[0]?.version_number ?? 1}</dd>
        </div>
      </dl>

      <section className="mt-10 border-l-4 border-[var(--notice)] bg-[var(--notice-soft)] p-6">
        <h2 className="text-lg font-semibold">Document reader</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Open the reader to follow processing, browse extracted text, search, or view the original PDF.
        </p>
        <Link
          className="mt-4 inline-flex bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          href={`/documents/${document.id}/read`}
        >
          Open reader
        </Link>
      </section>
    </div>
  );
}

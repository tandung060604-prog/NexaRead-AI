"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useI18n } from "@/components/i18n-provider";
import { ProcessingTimeline } from "@/components/processing-timeline";
import {
  DocumentDetail as DocumentDetailType,
  ProcessingStatus,
  fetchDocument,
  fetchProcessingStatus,
  originalPdfUrl,
  reprocessDocument,
  setDocumentTypeOverride,
} from "@/lib/documents-api";

type DocumentDetailProps = {
  documentId: string;
};

const DOCUMENT_TYPES = [
  "BOOK",
  "TEXTBOOK",
  "LECTURE",
  "RESEARCH_PAPER",
  "THESIS",
  "TECHNICAL",
  "REPORT",
  "LEGAL",
  "WORK",
  "WEB_ARTICLE",
  "OTHER",
] as const;

const TERMINAL_STAGES = new Set(["COMPLETE", "FAILED", "OCR_REQUIRED"]);

export function DocumentDetail({ documentId }: DocumentDetailProps) {
  const { t, formatDate, formatNumber } = useI18n();
  const [document, setDocument] = useState<DocumentDetailType | null>(null);
  const [processing, setProcessing] = useState<ProcessingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSavingType, setIsSavingType] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      try {
        const [documentResult, statusResult] = await Promise.all([
          fetchDocument(documentId),
          fetchProcessingStatus(documentId),
        ]);
        if (!active) return;
        setDocument(documentResult);
        setProcessing(statusResult);
        setError(null);
        if (!TERMINAL_STAGES.has(statusResult.stage)) {
          timer = setTimeout(() => void refresh(), 1500);
        }
      } catch (loadError: unknown) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("library", "detail.loadError"),
          );
        }
      }
    };
    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [documentId, t]);

  async function handleDocumentTypeChange(value: string) {
    setIsSavingType(true);
    setActionError(null);
    try {
      const updated = await setDocumentTypeOverride(
        documentId,
        value || null,
      );
      setDocument(updated);
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : t("library", "detail.overrideFailed"),
      );
    } finally {
      setIsSavingType(false);
    }
  }

  async function handleReprocess() {
    setIsReprocessing(true);
    setActionError(null);
    try {
      const updated = await reprocessDocument(documentId);
      setDocument(updated);
      setProcessing(await fetchProcessingStatus(documentId));
    } catch (reprocessError) {
      setActionError(
        reprocessError instanceof Error
          ? reprocessError.message
          : t("library", "detail.reprocessFailed"),
      );
    } finally {
      setIsReprocessing(false);
    }
  }

  if (error) {
    return (
      <p
        className="border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-5"
        role="alert"
      >
        {error}
      </p>
    );
  }
  if (!document) {
    return (
      <div
        aria-label={t("library", "detail.loading")}
        className="h-48 animate-pulse bg-[var(--surface-muted)]"
      />
    );
  }

  const createdAt = formatDate(document.created_at, {
    dateStyle: "long",
    timeStyle: "short",
  });
  const result = document.processing_result;
  const latestJob = document.processing_jobs.at(-1);
  const activeStage = processing?.stage ?? latestJob?.status ?? document.status;
  const progress = processing?.progress ?? latestJob?.progress ?? 0;

  return (
    <div className="w-full">
      <Link className="text-sm font-semibold text-[var(--accent-strong)]" href="/library">
        {t("library", "back")}
      </Link>
      <h1 className="mt-5 text-3xl font-semibold">{document.title}</h1>
      <p className="mt-2 text-[var(--muted)]">{document.original_filename}</p>

      <dl className="mt-8 grid max-w-3xl grid-cols-1 border-y border-[var(--border)] sm:grid-cols-2">
        <div className="border-b border-[var(--border)] py-4 sm:pr-6">
          <dt className="text-xs font-semibold uppercase text-[var(--muted)]">
            {t("library", "detail.status")}
          </dt>
          <dd className="mt-1 font-semibold">
            {t("library", `statuses.${document.status.toUpperCase()}`)}
          </dd>
        </div>
        <div className="border-b border-[var(--border)] py-4 sm:pl-6">
          <dt className="text-xs font-semibold uppercase text-[var(--muted)]">
            {t("library", "detail.created")}
          </dt>
          <dd className="mt-1">{createdAt}</dd>
        </div>
        <div className="py-4 sm:pr-6">
          <dt className="text-xs font-semibold uppercase text-[var(--muted)]">
            {t("library", "detail.fileSize")}
          </dt>
          <dd className="mt-1">
            {formatNumber(document.file_size / 1024, { maximumFractionDigits: 1 })} KB
          </dd>
        </div>
        <div className="py-4 sm:pl-6">
          <dt className="text-xs font-semibold uppercase text-[var(--muted)]">
            {t("library", "detail.version")}
          </dt>
          <dd className="mt-1">{document.versions.at(-1)?.version_number ?? 1}</dd>
        </div>
      </dl>

      <div className="mt-8 max-w-3xl">
        <ProcessingTimeline
          activeStage={activeStage}
          completedStages={processing?.completed_stages ?? []}
          failed={activeStage === "FAILED"}
          progress={progress}
        />
      </div>

      {result ? (
        <section className="mt-10 max-w-4xl">
          <h2 className="text-xl font-semibold">
            {t("library", "detail.processingResult")}
          </h2>
          <dl className="mt-4 grid grid-cols-1 border-y border-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
            <ResultItem
              label={t("library", "detail.documentType")}
              value={t("library", `categories.${result.effective_document_type}`)}
            />
            <ResultItem
              label={t("library", "detail.language")}
              value={t("library", `languages.${result.language}`)}
            />
            <ResultItem
              label={t("library", "detail.sourcePages")}
              value={formatNumber(result.source_page_count)}
            />
            <ResultItem
              label={t("library", "detail.chapterCount")}
              value={formatNumber(result.chapter_count)}
            />
            <ResultItem
              label={t("library", "detail.layoutQuality")}
              value={t("library", `quality.${result.layout_quality}`)}
            />
            <ResultItem
              label={t("library", "detail.layoutScore")}
              value={
                result.layout_quality_score === null
                  ? "—"
                  : `${formatNumber(result.layout_quality_score * 100, {
                      maximumFractionDigits: 0,
                    })}%`
              }
            />
          </dl>
          {result.warnings.length ? (
            <div className="mt-5 border-l-4 border-[var(--notice)] bg-[var(--notice-soft)] p-5">
              <h3 className="font-semibold">{t("library", "detail.warnings")}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">
              {t("library", "detail.noWarnings")}
            </p>
          )}
        </section>
      ) : null}

      <section className="mt-10 max-w-3xl border-l-4 border-[var(--notice)] bg-[var(--notice-soft)] p-6">
        <h2 className="text-lg font-semibold">{t("library", "detail.readerTitle")}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          {t("library", "detail.readerDescription")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            className="inline-flex border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold"
            href={originalPdfUrl(document.id)}
            rel="noreferrer"
            target="_blank"
          >
            {t("library", "detail.viewOriginal")}
          </a>
          <Link
            className="inline-flex bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            href={`/documents/${document.id}/read`}
          >
            {t("library", "detail.viewClean")}
          </Link>
        </div>

        <label
          className="mt-7 block text-sm font-semibold"
          htmlFor="document-type-override"
        >
          {t("library", "detail.overrideType")}
        </label>
        <select
          className="mt-2 min-h-11 w-full border border-[var(--border-strong)] bg-white px-3 sm:max-w-sm"
          disabled={isSavingType}
          id="document-type-override"
          onChange={(event) => void handleDocumentTypeChange(event.target.value)}
          value={document.document_type_override ?? ""}
        >
          <option value="">{t("library", "detail.useDetectedType")}</option>
          {DOCUMENT_TYPES.map((documentType) => (
            <option key={documentType} value={documentType}>
              {t("library", `categories.${documentType}`)}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {t("library", "detail.overrideHint")}
        </p>

        <button
          className="mt-5 border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isReprocessing || !TERMINAL_STAGES.has(activeStage)}
          onClick={() => void handleReprocess()}
          type="button"
        >
          {isReprocessing
            ? t("library", "detail.reprocessing")
            : t("library", "detail.reprocess")}
        </button>
        {actionError ? (
          <p className="mt-4 text-sm font-semibold text-[var(--danger)]" role="alert">
            {actionError}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--border)] py-4 sm:px-4 sm:first:pl-0">
      <dt className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

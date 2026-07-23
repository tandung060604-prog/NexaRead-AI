"use client";

import Link from "next/link";
import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { useI18n } from "@/components/i18n-provider";
import { ProcessingTimeline } from "@/components/processing-timeline";
import {
  Collection,
  DocumentDetail,
  ProcessingStatus,
  fetchCollections,
  fetchDocument,
  fetchProcessingStatus,
  importDocumentUrl,
  originalPdfUrl,
  uploadDocument,
} from "@/lib/documents-api";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";

const MAX_UPLOAD_SIZE_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB ?? "50");
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const TERMINAL_STAGES = new Set(["COMPLETE", "FAILED", "OCR_REQUIRED"]);
const WIZARD_STEPS = [
  "source",
  "info",
  "type",
  "collection",
  "upload",
  "processing",
  "preview",
  "read",
] as const;
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

type SourceMode = "file" | "url";

export function validateDocumentFile(
  file: File,
  locale: Locale = DEFAULT_LOCALE,
): string | null {
  if (!/[.](pdf|docx|epub)$/i.test(file.name)) {
    return translate(locale, "upload", "validation.type");
  }
  if (file.size === 0) {
    return translate(locale, "upload", "validation.empty");
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return translate(locale, "upload", "validation.size", {
      size: MAX_UPLOAD_SIZE_MB,
    });
  }
  return null;
}

function formatFileSize(
  bytes: number,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string {
  if (bytes < 1024 * 1024) {
    return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} KB`;
  }
  return `${formatNumber(bytes / (1024 * 1024), {
    maximumFractionDigits: 1,
  })} MB`;
}

function sourceExtension(file: File | null): string {
  return file?.name.split(".").at(-1)?.toUpperCase() ?? "";
}

export function UploadForm() {
  const { locale, t, formatNumber } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [sourceMode, setSourceMode] = useState<SourceMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [documentType, setDocumentType] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsUnavailable, setCollectionsUnavailable] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedDocument, setUploadedDocument] = useState<DocumentDetail | null>(null);
  const [processing, setProcessing] = useState<ProcessingStatus | null>(null);
  const documentId = uploadedDocument?.id;

  useEffect(() => {
    let active = true;
    void fetchCollections()
      .then((items) => {
        if (active) setCollections(items);
      })
      .catch(() => {
        if (active) setCollectionsUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!documentId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      try {
        const status = await fetchProcessingStatus(documentId);
        if (!active) return;
        setProcessing(status);
        if (TERMINAL_STAGES.has(status.stage)) {
          try {
            const detail = await fetchDocument(documentId);
            if (active) setUploadedDocument(detail);
          } catch {
            // The upload response still provides a safe result preview.
          }
          if (active) setStep(7);
          return;
        }
        timer = setTimeout(() => void refresh(), 1500);
      } catch {
        if (active) {
          timer = setTimeout(() => void refresh(), 2500);
        }
      }
    };
    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [documentId]);

  function resetResult() {
    setUploadedDocument(null);
    setProcessing(null);
  }

  function chooseFile(nextFile: File | undefined) {
    resetResult();
    if (!nextFile) {
      setFile(null);
      return;
    }
    const validationError = validateDocumentFile(nextFile, locale);
    if (validationError) {
      setFile(null);
      setError(validationError);
      return;
    }
    setError(null);
    setFile(nextFile);
  }

  function selectSourceMode(mode: SourceMode) {
    setSourceMode(mode);
    setError(null);
    resetResult();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    setSourceMode("file");
    chooseFile(event.dataTransfer.files?.[0]);
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  function validateSource(): boolean {
    if (sourceMode === "file") {
      if (!file) {
        setError(t("upload", "validation.required"));
        return false;
      }
      const validationError = validateDocumentFile(file, locale);
      if (validationError) {
        setError(validationError);
        return false;
      }
    } else if (!/^https?:\/\/\S+$/i.test(url.trim())) {
      setError(t("upload", "validation.url"));
      return false;
    }
    setError(null);
    return true;
  }

  function nextFromSource() {
    if (validateSource()) setStep(2);
  }

  async function submitDocument() {
    if (!validateSource()) {
      setStep(1);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const options = {
        document_type_override: documentType || null,
        collection_id: collectionId || null,
      };
      const document = sourceMode === "file" && file
        ? await uploadDocument(file, options)
        : await importDocumentUrl(url.trim(), options);
      setUploadedDocument(document);
      setProcessing(null);
      setStep(6);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("upload", "validation.uploadFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function startOver() {
    setStep(1);
    setFile(null);
    setUrl("");
    setDocumentType("");
    setCollectionId("");
    setError(null);
    resetResult();
    if (inputRef.current) inputRef.current.value = "";
  }

  const selectedCollection = collections.find((item) => item.id === collectionId);
  const isOcrRequired = processing?.stage === "OCR_REQUIRED";
  const processingFailed = processing?.stage === "FAILED";
  const canRead = processing?.stage === "COMPLETE";

  return (
    <div className="w-full max-w-4xl">
      <nav aria-label={t("upload", "wizard.progressLabel")}>
        <ol className="grid grid-cols-4 gap-2 lg:grid-cols-8">
          {WIZARD_STEPS.map((name, index) => {
            const number = index + 1;
            const isCurrent = step === number;
            const isComplete = step > number;
            return (
              <li
                aria-current={isCurrent ? "step" : undefined}
                className={`border-t-2 pt-2 text-xs ${
                  isCurrent
                    ? "border-[var(--accent)] font-semibold text-[var(--accent-strong)]"
                    : isComplete
                      ? "border-[var(--foreground)] text-[var(--foreground)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                }`}
                key={name}
              >
                <span className="block font-semibold">{number}</span>
                <span>{t("upload", `wizard.steps.${name}`)}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      {error ? (
        <div
          className="mt-6 border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm"
          role="alert"
        >
          <p className="font-semibold">{error}</p>
          <p className="mt-1 text-[var(--muted)]">
            {t("upload", "validation.guidance")}
          </p>
        </div>
      ) : null}

      <section
        aria-labelledby={`upload-step-${step}`}
        className="mt-6 border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
      >
        <p className="text-xs font-semibold uppercase text-[var(--accent)]">
          {t("upload", "wizard.stepCount", { current: step, total: WIZARD_STEPS.length })}
        </p>

        {step === 1 ? (
          <>
            <h2 className="mt-2 text-2xl font-semibold" id="upload-step-1">
              {t("upload", "source.title")}
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-3" role="group" aria-label={t("upload", "source.modeLabel")}>
              <button
                aria-pressed={sourceMode === "file"}
                className={`min-h-12 border px-4 text-sm font-semibold ${
                  sourceMode === "file"
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border-strong)]"
                }`}
                onClick={() => selectSourceMode("file")}
                type="button"
              >
                {t("upload", "source.file")}
              </button>
              <button
                aria-pressed={sourceMode === "url"}
                className={`min-h-12 border px-4 text-sm font-semibold ${
                  sourceMode === "url"
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border-strong)]"
                }`}
                onClick={() => selectSourceMode("url")}
                type="button"
              >
                {t("upload", "source.url")}
              </button>
            </div>

            {sourceMode === "file" ? (
              <div
                aria-label={t("upload", "dropzoneLabel")}
                className={`mt-5 flex min-h-60 cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-8 text-center transition-colors ${
                  isDragging
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border-strong)] bg-[var(--surface-muted)] hover:border-[var(--accent)]"
                }`}
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                onKeyDown={handleDropzoneKeyDown}
                role="button"
                tabIndex={0}
              >
                <span
                  aria-hidden="true"
                  className="grid size-12 place-items-center rounded-full bg-[var(--accent-soft)] text-2xl text-[var(--accent-strong)]"
                >
                  +
                </span>
                <p className="mt-4 text-lg font-semibold">{t("upload", "dropzone")}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">{t("upload", "selectHint")}</p>
                <span className="mt-5 min-h-11 border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold">
                  {t("upload", "choose")}
                </span>
                <input
                  ref={inputRef}
                  accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/epub+zip,.pdf,.docx,.epub"
                  aria-label={t("upload", "chooseFileLabel")}
                  className="sr-only"
                  onChange={handleInputChange}
                  type="file"
                />
                <p className="mt-5 text-xs text-[var(--muted)]">
                  {t("upload", "fileLimit", { size: MAX_UPLOAD_SIZE_MB })}
                </p>
              </div>
            ) : (
              <div className="mt-5">
                <label className="block text-sm font-semibold" htmlFor="document-url">
                  {t("upload", "urlLabel")}
                </label>
                <input
                  className="mt-2 min-h-12 w-full border border-[var(--border-strong)] bg-[var(--surface)] px-4"
                  id="document-url"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/article"
                  type="url"
                  value={url}
                />
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {t("upload", "source.urlHint")}
                </p>
              </div>
            )}

            {file && sourceMode === "file" ? (
              <div className="mt-4 flex items-center justify-between border border-[var(--border)] p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{file.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {formatFileSize(file.size, formatNumber)}
                  </p>
                </div>
                <button
                  className="ml-4 min-h-11 px-3 text-sm font-semibold text-[var(--danger)]"
                  onClick={() => chooseFile(undefined)}
                  type="button"
                >
                  {t("upload", "remove")}
                </button>
              </div>
            ) : null}

            <div className="mt-5 grid gap-3 text-sm text-[var(--muted)] sm:grid-cols-3">
              <p>{t("upload", "trust.formats")}</p>
              <p>{t("upload", "trust.size", { size: MAX_UPLOAD_SIZE_MB })}</p>
              <p>{t("upload", "trust.privacy")}</p>
            </div>
            <WizardActions
              nextLabel={t("upload", "actions.continue")}
              onNext={nextFromSource}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h2 className="mt-2 text-2xl font-semibold" id="upload-step-2">
              {t("upload", "info.title")}
            </h2>
            <dl className="mt-5 grid gap-4 border border-[var(--border)] p-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase text-[var(--muted)]">
                  {t("upload", "info.source")}
                </dt>
                <dd className="mt-1 break-all font-semibold">
                  {sourceMode === "file" ? file?.name : url.trim()}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[var(--muted)]">
                  {t("upload", "info.kind")}
                </dt>
                <dd className="mt-1 font-semibold">
                  {sourceMode === "file"
                    ? sourceExtension(file)
                    : t("upload", "source.publicUrl")}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[var(--muted)]">
                  {t("upload", "info.size")}
                </dt>
                <dd className="mt-1 font-semibold">
                  {file
                    ? formatFileSize(file.size, formatNumber)
                    : t("upload", "info.fetchedSecurely")}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[var(--muted)]">
                  {t("upload", "info.visibility")}
                </dt>
                <dd className="mt-1 font-semibold">{t("upload", "trust.privacy")}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              {t("upload", "info.safety")}
            </p>
            <WizardActions
              backLabel={t("upload", "actions.back")}
              nextLabel={t("upload", "actions.continue")}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h2 className="mt-2 text-2xl font-semibold" id="upload-step-3">
              {t("upload", "type.title")}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {t("upload", "type.description")}
            </p>
            <label className="mt-5 block text-sm font-semibold" htmlFor="document-type">
              {t("upload", "type.label")}
            </label>
            <select
              className="mt-2 min-h-12 w-full border border-[var(--border-strong)] bg-[var(--surface)] px-4"
              id="document-type"
              onChange={(event) => setDocumentType(event.target.value)}
              value={documentType}
            >
              <option value="">{t("upload", "type.auto")}</option>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t("upload", `type.options.${type}`)}
                </option>
              ))}
            </select>
            <WizardActions
              backLabel={t("upload", "actions.back")}
              nextLabel={t("upload", "actions.continue")}
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          </>
        ) : null}

        {step === 4 ? (
          <>
            <h2 className="mt-2 text-2xl font-semibold" id="upload-step-4">
              {t("upload", "collection.title")}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {t("upload", "collection.description")}
            </p>
            <label className="mt-5 block text-sm font-semibold" htmlFor="collection">
              {t("upload", "collection.label")}
            </label>
            <select
              className="mt-2 min-h-12 w-full border border-[var(--border-strong)] bg-[var(--surface)] px-4"
              id="collection"
              onChange={(event) => setCollectionId(event.target.value)}
              value={collectionId}
            >
              <option value="">{t("upload", "collection.none")}</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
            {collectionsUnavailable ? (
              <p className="mt-3 text-sm text-[var(--muted)]">
                {t("upload", "collection.unavailable")}
              </p>
            ) : null}
            <WizardActions
              backLabel={t("upload", "actions.back")}
              nextLabel={t("upload", "actions.review")}
              onBack={() => setStep(3)}
              onNext={() => setStep(5)}
            />
          </>
        ) : null}

        {step === 5 ? (
          <>
            <h2 className="mt-2 text-2xl font-semibold" id="upload-step-5">
              {t("upload", "review.title")}
            </h2>
            <dl className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)]">
              <ReviewRow
                label={t("upload", "info.source")}
                value={sourceMode === "file" ? file?.name ?? "" : url.trim()}
              />
              <ReviewRow
                label={t("upload", "type.label")}
                value={documentType
                  ? t("upload", `type.options.${documentType}`)
                  : t("upload", "type.auto")}
              />
              <ReviewRow
                label={t("upload", "collection.label")}
                value={selectedCollection?.name ?? t("upload", "collection.none")}
              />
              <ReviewRow
                label={t("upload", "info.visibility")}
                value={t("upload", "trust.privacy")}
              />
            </dl>
            <WizardActions
              backLabel={t("upload", "actions.back")}
              disabled={isSubmitting}
              nextLabel={isSubmitting
                ? t("upload", "uploading")
                : sourceMode === "file"
                  ? t("upload", "submit")
                  : t("upload", "import")}
              onBack={() => setStep(4)}
              onNext={() => void submitDocument()}
            />
          </>
        ) : null}

        {step === 6 ? (
          <div role="status">
            <h2 className="mt-2 text-2xl font-semibold" id="upload-step-6">
              {t("upload", "processing.title")}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {t("upload", "processing.description")}
            </p>
            <div className="mt-5">
              <ProcessingTimeline
                activeStage={processing?.stage ?? "SAFETY_CHECK"}
                completedStages={processing?.completed_stages ?? ["UPLOADING"]}
                failed={processingFailed}
                progress={processing?.progress ?? 10}
              />
            </div>
            <p className="mt-4 text-sm text-[var(--muted)]">
              {t("upload", "processing.safeToLeave")}
            </p>
          </div>
        ) : null}

        {step === 7 && uploadedDocument ? (
          <>
            <h2 className="mt-2 text-2xl font-semibold" id="upload-step-7">
              {t("upload", "preview.title")}
            </h2>
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div>
                <h3 className="text-xl font-semibold">{uploadedDocument.title}</h3>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <PreviewStat
                    label={t("upload", "preview.type")}
                    value={
                      uploadedDocument.processing_result?.effective_document_type
                      ?? uploadedDocument.document_type_override
                      ?? uploadedDocument.layout_type
                    }
                  />
                  <PreviewStat
                    label={t("upload", "preview.language")}
                    value={uploadedDocument.processing_result?.language ?? "—"}
                  />
                  <PreviewStat
                    label={t("upload", "preview.pages")}
                    value={String(
                      uploadedDocument.processing_result?.source_page_count
                      ?? processing?.page_count
                      ?? "—",
                    )}
                  />
                  <PreviewStat
                    label={t("upload", "preview.chapters")}
                    value={String(uploadedDocument.processing_result?.chapter_count ?? "—")}
                  />
                </dl>
                {uploadedDocument.processing_result?.warnings.length ? (
                  <div className="mt-5 border border-[var(--border)] p-4">
                    <h3 className="font-semibold">{t("upload", "preview.warnings")}</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                      {uploadedDocument.processing_result.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <aside className="border border-[var(--border)] bg-[var(--surface-muted)] p-5">
                <h3 className="font-semibold">{t("upload", "preview.original")}</h3>
                <p className="mt-2 break-all text-sm text-[var(--muted)]">
                  {uploadedDocument.original_filename}
                </p>
                <a
                  className="mt-4 inline-flex min-h-11 items-center font-semibold text-[var(--accent-strong)]"
                  href={originalPdfUrl(uploadedDocument.id)}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("upload", "preview.openOriginal")}
                </a>
              </aside>
            </div>

            {isOcrRequired ? (
              <div className="mt-5 border-l-4 border-[var(--notice)] bg-[var(--notice-soft)] p-5">
                <h3 className="font-semibold">{t("upload", "ocr.title")}</h3>
                <p className="mt-2 text-sm leading-6">{t("upload", "ocr.description")}</p>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
                  <li>{t("upload", "ocr.step1")}</li>
                  <li>{t("upload", "ocr.step2")}</li>
                  <li>{t("upload", "ocr.step3")}</li>
                </ol>
              </div>
            ) : null}

            {processingFailed ? (
              <div className="mt-5 border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-5">
                <h3 className="font-semibold">{t("upload", "failed.title")}</h3>
                <p className="mt-2 text-sm">
                  {processing?.error_message ?? t("upload", "failed.description")}
                </p>
              </div>
            ) : null}

            <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-[var(--border)] pt-5">
              <button
                className="min-h-11 border border-[var(--border-strong)] px-5 text-sm font-semibold"
                onClick={startOver}
                type="button"
              >
                {t("upload", "actions.addAnother")}
              </button>
              {canRead ? (
                <button
                  className="min-h-11 bg-[var(--accent)] px-6 text-sm font-semibold text-white"
                  onClick={() => setStep(8)}
                  type="button"
                >
                  {t("upload", "actions.continueToRead")}
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {step === 8 && uploadedDocument ? (
          <>
            <h2 className="mt-2 text-2xl font-semibold" id="upload-step-8">
              {t("upload", "ready.title")}
            </h2>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              {t("upload", "ready.description", { title: uploadedDocument.title })}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-12 items-center bg-[var(--accent)] px-6 text-sm font-semibold text-white"
                href={`/documents/${uploadedDocument.id}/read`}
              >
                {t("upload", "ready.startReading")}
              </Link>
              <Link
                className="inline-flex min-h-12 items-center border border-[var(--border-strong)] px-6 text-sm font-semibold"
                href={`/documents/${uploadedDocument.id}`}
              >
                {t("upload", "viewDetails")}
              </Link>
              <Link
                className="inline-flex min-h-12 items-center px-4 text-sm font-semibold text-[var(--accent-strong)]"
                href="/library"
              >
                {t("upload", "openLibrary")}
              </Link>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function WizardActions({
  backLabel,
  nextLabel,
  onBack,
  onNext,
  disabled = false,
}: {
  backLabel?: string;
  nextLabel: string;
  onBack?: () => void;
  onNext: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-7 flex justify-between gap-3 border-t border-[var(--border)] pt-5">
      {onBack ? (
        <button
          className="min-h-11 border border-[var(--border-strong)] px-5 text-sm font-semibold disabled:opacity-50"
          disabled={disabled}
          onClick={onBack}
          type="button"
        >
          {backLabel}
        </button>
      ) : <span />}
      <button
        className="min-h-11 bg-[var(--accent)] px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={onNext}
        type="button"
      >
        {nextLabel}
      </button>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm font-semibold text-[var(--muted)]">{label}</dt>
      <dd className="break-all text-sm font-semibold">{value}</dd>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border)] p-4">
      <dt className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

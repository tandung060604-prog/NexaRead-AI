"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, useRef, useState } from "react";

import { DocumentDetail, uploadDocument } from "@/lib/documents-api";

const MAX_UPLOAD_SIZE_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB ?? "50");
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

export function validatePdfFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return "Choose a PDF file.";
  }
  if (file.size === 0) {
    return "The PDF file is empty.";
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return `The PDF must be ${MAX_UPLOAD_SIZE_MB} MB or smaller.`;
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedDocument, setUploadedDocument] = useState<DocumentDetail | null>(null);

  function chooseFile(nextFile: File | undefined) {
    setUploadedDocument(null);
    if (!nextFile) {
      setFile(null);
      return;
    }
    const validationError = validatePdfFile(nextFile);
    if (validationError) {
      setFile(null);
      setError(validationError);
      return;
    }
    setError(null);
    setFile(nextFile);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a PDF file before uploading.");
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const document = await uploadDocument(file);
      setUploadedDocument(document);
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form className="w-full max-w-3xl" onSubmit={handleSubmit}>
      <div
        aria-label="PDF upload dropzone"
        className={`flex min-h-64 cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-10 text-center transition-colors ${
          isDragging
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--accent)]"
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
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-2xl text-[var(--accent-strong)]">
          +
        </div>
        <p className="text-lg font-semibold">Drop a PDF here</p>
        <p className="mt-2 text-sm text-[var(--muted)]">or select one from your computer</p>
        <span className="mt-5 border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold">
          Choose PDF
        </span>
        <input
          ref={inputRef}
          accept="application/pdf,.pdf"
          aria-label="Choose PDF file"
          className="sr-only"
          onChange={handleInputChange}
          type="file"
        />
        <p className="mt-5 text-xs text-[var(--muted)]">PDF only, up to {MAX_UPLOAD_SIZE_MB} MB</p>
      </div>

      {file ? (
        <div className="mt-5 flex items-center justify-between border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="min-w-0">
            <p className="truncate font-semibold">{file.name}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{formatFileSize(file.size)}</p>
          </div>
          <button
            className="ml-4 text-sm font-semibold text-[var(--danger)]"
            onClick={() => chooseFile(undefined)}
            type="button"
          >
            Remove
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-5 border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {uploadedDocument ? (
        <div className="mt-5 border-l-4 border-[var(--accent)] bg-[var(--accent-soft)] p-5" role="status">
          <p className="font-semibold">Upload complete</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{uploadedDocument.title} is now in your library.</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-[var(--accent-strong)]">
            <Link href="/library">Open Library</Link>
            <Link href={`/documents/${uploadedDocument.id}`}>View details</Link>
          </div>
        </div>
      ) : null}

      <button
        className="mt-6 min-h-11 bg-[var(--accent)] px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!file || isUploading}
        type="submit"
      >
        {isUploading ? "Uploading..." : "Upload PDF"}
      </button>
    </form>
  );
}


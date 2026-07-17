"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DocumentSummary,
  deleteDocument,
  fetchDocuments,
  renameDocument,
} from "@/lib/documents-api";

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DocumentLibrary() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [pendingDelete, setPendingDelete] = useState<DocumentSummary | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const result = await fetchDocuments();
      setError(null);
      setDocuments(result.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the library.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    fetchDocuments()
      .then((result) => {
        if (isActive) {
          setDocuments(result.items);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Could not load the library.");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renamingId || !renameTitle.trim()) {
      return;
    }
    setIsMutating(true);
    setError(null);
    try {
      await renameDocument(renamingId, renameTitle.trim());
      setRenamingId(null);
      await loadDocuments();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Rename failed.");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) {
      return;
    }
    setIsMutating(true);
    setError(null);
    try {
      await deleteDocument(pendingDelete.id);
      setPendingDelete(null);
      await loadDocuments();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed.");
    } finally {
      setIsMutating(false);
    }
  }

  if (isLoading) {
    return (
      <div aria-label="Loading documents" className="grid gap-3">
        {[0, 1, 2].map((item) => (
          <div className="h-24 animate-pulse bg-[var(--surface-muted)]" key={item} />
        ))}
      </div>
    );
  }

  if (error && documents.length === 0) {
    return (
      <div className="border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-5" role="alert">
        <p className="font-semibold">Could not load your library</p>
        <p className="mt-1 text-sm">{error}</p>
        <button className="mt-4 text-sm font-semibold underline" onClick={() => void loadDocuments()} type="button">
          Try again
        </button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-14 text-center">
        <h2 className="text-xl font-semibold">Your library is empty</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Upload a PDF to start building your reading library.</p>
        <Link className="mt-5 inline-flex bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white" href="/upload">
          Upload a PDF
        </Link>
      </div>
    );
  }

  return (
    <div>
      {error ? <p className="mb-4 bg-[var(--danger-soft)] p-3 text-sm" role="alert">{error}</p> : null}
      <div className="border-y border-[var(--border)]">
        {documents.map((document) => (
          <article className="grid gap-4 border-b border-[var(--border)] py-5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" key={document.id}>
            <div className="min-w-0">
              {renamingId === document.id ? (
                <form className="flex max-w-xl gap-2" onSubmit={handleRename}>
                  <input
                    aria-label={`Rename ${document.title}`}
                    autoFocus
                    className="min-w-0 flex-1 border border-[var(--border-strong)] bg-white px-3 py-2"
                    maxLength={255}
                    onChange={(event) => setRenameTitle(event.target.value)}
                    value={renameTitle}
                  />
                  <button className="bg-[var(--accent)] px-4 text-sm font-semibold text-white" disabled={isMutating} type="submit">
                    Save
                  </button>
                  <button className="px-3 text-sm font-semibold" onClick={() => setRenamingId(null)} type="button">
                    Cancel
                  </button>
                </form>
              ) : (
                <Link className="font-semibold hover:text-[var(--accent-strong)]" href={`/documents/${document.id}`}>
                  {document.title}
                </Link>
              )}
              <p className="mt-1 truncate text-sm text-[var(--muted)]">{document.original_filename}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--muted)]">
                <span>{formatFileSize(document.file_size)}</span>
                <span>{formatDate(document.created_at)}</span>
                <span className="font-semibold uppercase text-[var(--accent-strong)]">{document.status}</span>
              </div>
            </div>
            <div className="flex gap-4 text-sm font-semibold">
              <button
                onClick={() => {
                  setRenamingId(document.id);
                  setRenameTitle(document.title);
                }}
                type="button"
              >
                Rename
              </button>
              <button className="text-[var(--danger)]" onClick={() => setPendingDelete(document)} type="button">
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
      {pendingDelete ? (
        <ConfirmDialog
          documentTitle={pendingDelete.title}
          isDeleting={isMutating}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </div>
  );
}

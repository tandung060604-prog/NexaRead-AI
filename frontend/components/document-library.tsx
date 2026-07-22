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

  // Helper to generate a consistent gradient based on document ID
  const getGradient = (id: string) => {
    const gradients = [
      "from-blue-500 to-cyan-400",
      "from-indigo-500 to-purple-500",
      "from-emerald-500 to-teal-400",
      "from-rose-500 to-pink-500",
      "from-amber-500 to-orange-400",
      "from-slate-700 to-slate-500",
    ];
    const index = id.charCodeAt(0) % gradients.length;
    return gradients[index];
  };

  return (
    <div className="w-full">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">Your Library</h1>
          <p className="mt-2 text-[var(--muted)]">Select a document to enter the reading room.</p>
        </div>
      </div>

      {error ? <p className="mb-6 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4 text-sm" role="alert">{error}</p> : null}

      <div className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {documents.map((document) => (
          <div key={document.id} className="group relative flex flex-col items-center">
            {/* The Book Cover */}
            <Link href={`/documents/${document.id}/read`} className="relative w-full aspect-[3/4] rounded-r-md rounded-l-sm bg-gradient-to-br shadow-[2px_4px_12px_rgba(0,0,0,0.15)] transition-all duration-300 ease-out hover:-translate-y-2 hover:shadow-[8px_16px_24px_rgba(0,0,0,0.2)] hover:rotate-y-[-10deg] [transform-style:preserve-3d] perspective-[1000px]">
              <div className={`absolute inset-0 rounded-r-md rounded-l-sm bg-gradient-to-br ${getGradient(document.id)} opacity-90`} />

              {/* Book Spine lighting effect */}
              <div className="absolute inset-y-0 left-0 w-3 rounded-l-sm bg-gradient-to-r from-black/20 via-white/20 to-transparent" />

              <div className="absolute inset-0 p-4 flex flex-col">
                <div className="mt-4 flex-1">
                  <h3 className="line-clamp-4 text-sm font-bold leading-snug text-white drop-shadow-md">
                    {document.title}
                  </h3>
                </div>
                <div className="mt-auto">
                  <span className="inline-flex rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white/90 uppercase tracking-wider backdrop-blur-sm">
                    {document.status === "READY" ? "Book" : document.status}
                  </span>
                </div>
              </div>
            </Link>

            {/* Document Info & Actions */}
            <div className="mt-4 w-full px-1">
              {renamingId === document.id ? (
                <form className="flex flex-col gap-2" onSubmit={handleRename}>
                  <input
                    aria-label={`Rename ${document.title}`}
                    autoFocus
                    className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
                    maxLength={255}
                    onChange={(event) => setRenameTitle(event.target.value)}
                    value={renameTitle}
                  />
                  <div className="flex gap-2">
                    <button className="flex-1 rounded bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-white" disabled={isMutating} type="submit">
                      Save
                    </button>
                    <button className="flex-1 rounded bg-[var(--surface-muted)] px-2 py-1 text-xs font-semibold" onClick={() => setRenamingId(null)} type="button">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--foreground)]" title={document.title}>
                      {document.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                      {formatDate(document.created_at)}
                    </p>
                  </div>

                  {/* Action Menu Trigger (simplified for now as inline buttons on hover) */}
                  <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      className="p-1 text-[var(--muted)] hover:text-[var(--accent)]"
                      onClick={() => {
                        setRenamingId(document.id);
                        setRenameTitle(document.title);
                      }}
                      title="Rename"
                      type="button"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    <button
                      className="p-1 text-[var(--muted)] hover:text-[var(--danger)]"
                      onClick={() => setPendingDelete(document)}
                      title="Delete"
                      type="button"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
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

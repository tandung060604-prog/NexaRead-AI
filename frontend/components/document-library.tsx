"use client";

import {
  Archive,
  ArchiveRestore,
  Grid2X2,
  List,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useI18n } from "@/components/i18n-provider";
import {
  Collection,
  LibraryDocument,
  LibraryQuery,
  Tag,
  createCollection,
  createTag,
  deleteDocument,
  documentCoverUrl,
  fetchCollections,
  fetchDocuments,
  fetchTags,
  organizeDocument,
  renameDocument,
} from "@/lib/documents-api";

type ViewMode = "grid" | "list";

const EMPTY_FILTERS = {
  source_type: "",
  status: "",
  collection_id: "",
  tag_id: "",
  language: "",
  completion: "",
};

function deterministicCoverStyle(id: string): {
  backgroundColor: string;
  backgroundImage: string;
} {
  const hash = [...id].reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    2166136261,
  );
  const hue = hash % 360;
  const secondaryHue = (hue + 28 + (hash % 34)) % 360;
  return {
    backgroundColor: `hsl(${hue} 38% 30%)`,
    backgroundImage: [
      `linear-gradient(145deg, hsl(${hue} 44% 25%), hsl(${secondaryHue} 52% 44%))`,
      "radial-gradient(circle at 75% 18%, rgb(255 255 255 / 0.16), transparent 32%)",
    ].join(","),
  };
}

export function DocumentLibrary({
  initialCollectionId = "",
}: {
  initialCollectionId?: string;
}) {
  const { t } = useI18n();
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LibraryQuery["sort"]>("newest");
  const [filters, setFilters] = useState({
    ...EMPTY_FILTERS,
    collection_id: initialCollectionId,
  });
  const [archived, setArchived] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<LibraryDocument | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useMemo<LibraryQuery>(
    () => ({
      search: search || undefined,
      sort,
      source_type: filters.source_type || undefined,
      status: filters.status || undefined,
      collection_id: filters.collection_id || undefined,
      tag_id: filters.tag_id || undefined,
      language: filters.language || undefined,
      completion:
        (filters.completion as LibraryQuery["completion"]) || undefined,
      archived,
      limit: 100,
    }),
    [archived, filters, search, sort],
  );

  const loadDocuments = useCallback(async () => {
    const result = await fetchDocuments(query);
    setDocuments(result.items);
    return result;
  }, [query]);

  const loadMetadata = useCallback(async () => {
    const [collectionItems, tagItems] = await Promise.all([
      fetchCollections(),
      fetchTags(),
    ]);
    setCollections(collectionItems);
    setTags(tagItems);
  }, []);

  useEffect(() => {
    let active = true;
    fetchDocuments(query)
      .then((result) => {
        if (active) {
          setDocuments(result.items);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("library", "loadError"),
          );
        }
      })
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [query, t]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchCollections(), fetchTags()])
      .then(([collectionItems, tagItems]) => {
        if (active) {
          setCollections(collectionItems);
          setTags(tagItems);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("library", "loadError"),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [loadMetadata, t]);

  const hasFilters =
    Boolean(search) ||
    archived ||
    Object.values(filters).some(Boolean) ||
    sort !== "newest";

  async function mutate(operation: () => Promise<unknown>) {
    setIsMutating(true);
    setError(null);
    try {
      await operation();
      await Promise.all([loadDocuments(), loadMetadata()]);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : t("library", "operationFailed"),
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renamingId || !renameTitle.trim()) return;
    await mutate(() => renameDocument(renamingId, renameTitle.trim()));
    setRenamingId(null);
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    await mutate(() => deleteDocument(pendingDelete.id));
    setPendingDelete(null);
  }

  async function handleCreateCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCollectionName.trim();
    if (!name) return;
    await mutate(() => createCollection(name));
    setNewCollectionName("");
  }

  async function handleCreateTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newTagName.trim();
    if (!name) return;
    await mutate(() => createTag(name));
    setNewTagName("");
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setSort("newest");
    setFilters(EMPTY_FILTERS);
    setArchived(false);
  }

  if (error && documents.length === 0 && !isLoading) {
    return (
      <div
        className="border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-5"
        role="alert"
      >
        <p className="font-semibold">{t("library", "loadErrorTitle")}</p>
        <p className="mt-1 text-sm">{error}</p>
        <button
          className="mt-4 text-sm font-semibold underline"
          onClick={() => {
            setIsLoading(true);
            void Promise.all([loadDocuments(), loadMetadata()]).finally(() =>
              setIsLoading(false),
            );
          }}
          type="button"
        >
          {t("common", "actions.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-7">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(140px,auto))]">
          <label className="relative">
            <span className="sr-only">{t("library", "search")}</span>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-3 text-[var(--muted)]"
              size={18}
            />
            <input
              aria-label={t("library", "search")}
              className="min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--background)] pl-10 pr-3"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("library", "searchPlaceholder")}
              type="search"
              value={searchInput}
            />
          </label>
          <FilterSelect
            label={t("library", "sort.label")}
            onChange={(value) => setSort(value as LibraryQuery["sort"])}
            options={[
              ["newest", t("library", "sort.newest")],
              ["recent", t("library", "sort.recent")],
              ["title", t("library", "sort.title")],
              ["progress", t("library", "sort.progress")],
            ]}
            value={sort ?? "newest"}
          />
          <FilterSelect
            label={t("library", "filters.type")}
            onChange={(value) =>
              setFilters((current) => ({ ...current, source_type: value }))
            }
            options={[
              ["", t("library", "filters.allTypes")],
              ["pdf", "PDF"],
              ["docx", "DOCX"],
              ["epub", "EPUB"],
              ["url", t("library", "filters.web")],
            ]}
            value={filters.source_type}
          />
          <div className="flex items-center justify-end gap-1">
            <ViewButton
              active={viewMode === "grid"}
              label={t("library", "view.grid")}
              onClick={() => setViewMode("grid")}
            >
              <Grid2X2 size={18} />
            </ViewButton>
            <ViewButton
              active={viewMode === "list"}
              label={t("library", "view.list")}
              onClick={() => setViewMode("list")}
            >
              <List size={19} />
            </ViewButton>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label={t("library", "filters.status")}
            onChange={(value) =>
              setFilters((current) => ({ ...current, status: value }))
            }
            options={[
              ["", t("library", "filters.allStatuses")],
              ["AI_READY", t("library", "statuses.AI_READY")],
              ["READABLE", t("library", "statuses.READABLE")],
              ["INDEXING", t("library", "statuses.INDEXING")],
              ["FAILED", t("library", "statuses.FAILED")],
              ["OCR_REQUIRED", t("library", "statuses.OCR_REQUIRED")],
            ]}
            value={filters.status}
          />
          <FilterSelect
            label={t("library", "filters.collection")}
            onChange={(value) =>
              setFilters((current) => ({ ...current, collection_id: value }))
            }
            options={[
              ["", t("library", "filters.allCollections")],
              ...collections.map(
                (collection) =>
                  [collection.id, collection.name] as [string, string],
              ),
            ]}
            value={filters.collection_id}
          />
          <FilterSelect
            label={t("library", "filters.tag")}
            onChange={(value) =>
              setFilters((current) => ({ ...current, tag_id: value }))
            }
            options={[
              ["", t("library", "filters.allTags")],
              ...tags.map((tag) => [tag.id, tag.name] as [string, string]),
            ]}
            value={filters.tag_id}
          />
          <FilterSelect
            label={t("library", "filters.language")}
            onChange={(value) =>
              setFilters((current) => ({ ...current, language: value }))
            }
            options={[
              ["", t("library", "filters.allLanguages")],
              ["vi", t("library", "languages.vi")],
              ["en", t("library", "languages.en")],
              ["und", t("library", "languages.und")],
            ]}
            value={filters.language}
          />
          <FilterSelect
            label={t("library", "filters.progress")}
            onChange={(value) =>
              setFilters((current) => ({ ...current, completion: value }))
            }
            options={[
              ["", t("library", "filters.allProgress")],
              ["unread", t("library", "filters.unread")],
              ["in_progress", t("library", "filters.inProgress")],
              ["completed", t("library", "filters.completed")],
            ]}
            value={filters.completion}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input
              checked={archived}
              onChange={(event) => setArchived(event.target.checked)}
              type="checkbox"
            />
            {t("library", "filters.showArchived")}
          </label>
          {hasFilters ? (
            <button
              className="min-h-11 px-3 text-sm font-semibold text-[var(--accent-strong)]"
              onClick={clearFilters}
              type="button"
            >
              {t("library", "filters.clear")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InlineCreateForm
          buttonLabel={t("library", "collections.create")}
          label={t("library", "collections.newLabel")}
          onChange={setNewCollectionName}
          onSubmit={handleCreateCollection}
          placeholder={t("library", "collections.placeholder")}
          value={newCollectionName}
        />
        <InlineCreateForm
          buttonLabel={t("library", "tags.create")}
          label={t("library", "tags.newLabel")}
          onChange={setNewTagName}
          onSubmit={handleCreateTag}
          placeholder={t("library", "tags.placeholder")}
          value={newTagName}
        />
      </div>

      {error ? (
        <p
          className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div aria-label={t("library", "loading")} className="grid gap-3">
          {[0, 1, 2].map((item) => (
            <div
              className="h-32 animate-pulse rounded-xl bg-[var(--surface-muted)]"
              key={item}
            />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <EmptyLibrary filtered={hasFilters} onClear={clearFilters} />
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
              : "grid gap-4"
          }
        >
          {documents.map((document) => (
            <DocumentCard
              collections={collections}
              document={document}
              isMutating={isMutating}
              key={document.id}
              onArchive={() =>
                void mutate(() =>
                  organizeDocument(document.id, {
                    archived: !Boolean(document.archived_at),
                  }),
                )
              }
              onCollectionChange={(collectionId) =>
                void mutate(() =>
                  organizeDocument(document.id, {
                    collection_id: collectionId || null,
                  }),
                )
              }
              onDelete={() => setPendingDelete(document)}
              onRename={() => {
                setRenamingId(document.id);
                setRenameTitle(document.title);
              }}
              onTagToggle={(tagId) => {
                const selected = new Set(document.tags.map((tag) => tag.id));
                if (selected.has(tagId)) selected.delete(tagId);
                else selected.add(tagId);
                void mutate(() =>
                  organizeDocument(document.id, {
                    tag_ids: [...selected],
                  }),
                );
              }}
              renaming={renamingId === document.id}
              renameTitle={renameTitle}
              setRenameTitle={setRenameTitle}
              tags={tags}
              viewMode={viewMode}
              onCancelRename={() => setRenamingId(null)}
              onRenameSubmit={handleRename}
            />
          ))}
        </div>
      )}

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

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: [string, string][];
  value: string;
}) {
  return (
    <label className="text-xs font-semibold text-[var(--muted)]">
      {label}
      <select
        className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function ViewButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`grid size-11 place-items-center rounded-lg border ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "border-[var(--border)] text-[var(--muted)]"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function InlineCreateForm({
  buttonLabel,
  label,
  onChange,
  onSubmit,
  placeholder,
  value,
}: {
  buttonLabel: string;
  label: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
      onSubmit={onSubmit}
    >
      <label className="min-w-44 flex-1 text-xs font-semibold text-[var(--muted)]">
        {label}
        <input
          className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]"
          maxLength={80}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </label>
      <button
        className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-50"
        disabled={!value.trim()}
        type="submit"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

function EmptyLibrary({
  filtered,
  onClear,
}: {
  filtered: boolean;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-14 text-center">
      <h2 className="text-xl font-semibold">
        {t("library", filtered ? "noResultsTitle" : "emptyTitle")}
      </h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {t("library", filtered ? "noResultsDescription" : "emptyDescription")}
      </p>
      {filtered ? (
        <button
          className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent-strong)] underline"
          onClick={onClear}
          type="button"
        >
          {t("library", "filters.clear")}
        </button>
      ) : (
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-white"
          href="/upload"
        >
          {t("library", "uploadAction")}
        </Link>
      )}
    </div>
  );
}

function DocumentCard({
  collections,
  document,
  isMutating,
  onArchive,
  onCancelRename,
  onCollectionChange,
  onDelete,
  onRename,
  onRenameSubmit,
  onTagToggle,
  renaming,
  renameTitle,
  setRenameTitle,
  tags,
  viewMode,
}: {
  collections: Collection[];
  document: LibraryDocument;
  isMutating: boolean;
  onArchive: () => void;
  onCancelRename: () => void;
  onCollectionChange: (collectionId: string) => void;
  onDelete: () => void;
  onRename: () => void;
  onRenameSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTagToggle: (tagId: string) => void;
  renaming: boolean;
  renameTitle: string;
  setRenameTitle: (title: string) => void;
  tags: Tag[];
  viewMode: ViewMode;
}) {
  const { t, formatDate } = useI18n();
  const isList = viewMode === "list";
  const typeLabel =
    document.document_type_override ?? document.layout_type ?? document.source_type;
  return (
    <article
      className={
        isList
          ? "grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[88px_minmax(0,1fr)_minmax(210px,auto)]"
          : "group flex min-w-0 flex-col"
      }
    >
      <Link
        aria-label={`${t("library", "open")} ${document.title}`}
        className={
          isList
            ? "relative aspect-[3/4] w-[88px] overflow-hidden rounded-r-md rounded-l-sm shadow-lg"
            : "relative aspect-[3/4] w-full overflow-hidden rounded-r-md rounded-l-sm shadow-[2px_4px_12px_rgba(0,0,0,0.16)] transition-transform duration-200 motion-safe:hover:-translate-y-1"
        }
        href={`/documents/${document.id}/read`}
        style={deterministicCoverStyle(document.id)}
      >
        <Image
          alt=""
          className="absolute inset-0 size-full object-cover"
          height={640}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          src={documentCoverUrl(document.id)}
          unoptimized
          width={480}
        />
        <span className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/25 via-white/10 to-transparent" />
        <span className="absolute inset-0 flex flex-col p-4 text-white">
          <strong className="line-clamp-5 pt-3 text-sm leading-snug drop-shadow">
            {document.title}
          </strong>
          <span className="mt-auto text-[10px] font-semibold uppercase tracking-[0.16em] text-white/80">
            {typeLabel}
          </span>
        </span>
      </Link>

      <div className={isList ? "min-w-0 py-1" : "mt-4 min-w-0 px-1"}>
        {renaming ? (
          <form className="flex flex-col gap-2" onSubmit={onRenameSubmit}>
            <input
              aria-label={t("library", "renameLabel", { title: document.title })}
              autoFocus
              className="min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--background)] px-3 text-sm"
              maxLength={255}
              onChange={(event) => setRenameTitle(event.target.value)}
              value={renameTitle}
            />
            <div className="flex gap-2">
              <button
                className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-white"
                disabled={isMutating}
                type="submit"
              >
                {t("common", "actions.save")}
              </button>
              <button
                className="min-h-11 flex-1 rounded-lg bg-[var(--surface-muted)] px-3 text-xs font-semibold"
                onClick={onCancelRename}
                type="button"
              >
                {t("common", "actions.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <>
            <Link
              className="line-clamp-2 font-semibold hover:text-[var(--accent-strong)]"
              href={`/documents/${document.id}/read`}
            >
              {document.title}
            </Link>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {document.source_type.toUpperCase()} ·{" "}
              {t("library", `languages.${document.language}`)} ·{" "}
              {formatDate(document.created_at, { dateStyle: "medium" })}
            </p>
            <div
              aria-label={`${Math.round(document.progress_percent)}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(document.progress_percent)}
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"
              role="progressbar"
            >
              <div
                className="h-full bg-[var(--accent)]"
                style={{ width: `${document.progress_percent}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {document.collection ? (
                <span className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--accent-strong)]">
                  {document.collection.name}
                </span>
              ) : null}
              {document.tags.map((tag) => (
                <span
                  className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px]"
                  key={tag.id}
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {!renaming ? (
        <div
          className={
            isList
              ? "grid content-start gap-2 border-t border-[var(--border)] pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0"
              : "mt-3 grid gap-2 px-1"
          }
        >
          <label className="text-[11px] font-semibold text-[var(--muted)]">
            {t("library", "collections.move")}
            <select
              aria-label={t("library", "collections.moveLabel", {
                title: document.title,
              })}
              className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
              onChange={(event) => onCollectionChange(event.target.value)}
              value={document.collection?.id ?? ""}
            >
              <option value="">{t("library", "collections.none")}</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </label>
          <details className="rounded-lg border border-[var(--border)]">
            <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold">
              {t("library", "tags.manage")}
            </summary>
            <div className="grid gap-1 border-t border-[var(--border)] p-2">
              {tags.length ? (
                tags.map((tag) => (
                  <label
                    className="flex min-h-9 items-center gap-2 text-xs"
                    key={tag.id}
                  >
                    <input
                      checked={document.tags.some((item) => item.id === tag.id)}
                      onChange={() => onTagToggle(tag.id)}
                      type="checkbox"
                    />
                    {tag.name}
                  </label>
                ))
              ) : (
                <span className="p-1 text-xs text-[var(--muted)]">
                  {t("library", "tags.empty")}
                </span>
              )}
            </div>
          </details>
          <div className="flex gap-1">
            <ActionButton label={t("library", "rename")} onClick={onRename}>
              <Pencil size={16} />
            </ActionButton>
            <ActionButton
              label={t(
                "library",
                document.archived_at ? "restore" : "archive",
              )}
              onClick={onArchive}
            >
              {document.archived_at ? (
                <ArchiveRestore size={16} />
              ) : (
                <Archive size={16} />
              )}
            </ActionButton>
            <ActionButton
              danger
              label={t("library", "delete")}
              onClick={onDelete}
            >
              <Trash2 size={16} />
            </ActionButton>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ActionButton({
  children,
  danger = false,
  label,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`grid size-11 place-items-center rounded-lg border border-[var(--border)] ${
        danger
          ? "text-[var(--danger)]"
          : "text-[var(--muted)] hover:text-[var(--accent-strong)]"
      }`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

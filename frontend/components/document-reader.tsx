"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { LibraryBig, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, Search, Settings2, StickyNote, Tags, X } from "lucide-react";
import Link from "next/link";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useI18n } from "@/components/i18n-provider";
import {
  AccountReadingPreferencesInput,
  Bookmark,
  ContentBlock,
  DocumentDetail,
  Highlight,
  HighlightColor,
  KeywordDetail,
  KeywordFeedbackType,
  KeywordOccurrence,
  KeywordPreferences,
  KeywordPreferencesInput,
  ProcessingStatus,
  ProgressInput,
  ReadingPreferencesInput,
  SearchResult,
  TocItem,
  createBookmark,
  createHighlight,
  createKeywordFeedback,
  createNote,
  deleteBookmark,
  deleteHighlight,
  deleteNote,
  fetchBlocks,
  fetchBookmarks,
  fetchDocument,
  fetchHighlights,
  fetchDocumentKeywords,
  fetchKeywordDetail,
  fetchKeywordPreferences,
  fetchProcessingStatus,
  fetchProgress,
  fetchReadingPreferences,
  fetchToc,
  originalPdfUrl,
  saveProgress,
  saveKeywordPreferences,
  saveReadingPreferences,
  searchDocument,
  updateNote,
} from "@/lib/documents-api";
import { useDialogFocusTrap } from "@/lib/dialog-focus";
import { navigateToBlock } from "@/lib/reader-navigation";
import {
  normalizeReadingMode,
  type ReadingMode,
} from "@/lib/reading-preferences";
import {
  getDocumentReadingDefaults,
  resolveReaderFontFamily,
} from "@/lib/reader-personalization";

import { BlockSelection, ReaderBlock } from "./reader-block";
import { KeywordGlossary } from "./keyword-glossary";
import {
  AnnotationPanel,
  ReaderSettings,
  SelectionToolbar,
} from "./reader-tools";
import { BookReader } from "./book-reader";
import { DocumentChat } from "./document-chat";
import { ReaderToolbar } from "./reader-toolbar";
import { ResearchReferencePanel } from "./research-reference-panel";
import { useReadingRoom } from "./reading-room-provider";
import { PageTurnSound } from "@/lib/page-turn-sound";
import { getPresetById } from "@/config/typography-presets";

type DocumentReaderProps = { documentId: string };
type MobilePanel = "toc" | "chat" | "search" | "keywords" | "annotations" | "references" | "settings" | null;
type ToolTab = "chat" | "search" | "annotations" | "keywords" | "references";

const PROCESSING_STATES = new Set([
  "UPLOADED",
  "QUEUED",
  "SAFETY_CHECK",
  "EXTRACTING",
  "STRUCTURING",
  "INDEXING",
]);
const DEFAULT_PREFERENCES: ReadingPreferencesInput = {
  theme: "light",
  font_size: 17,
  line_height: 1.8,
  reading_width: 720,
  font_family: "sans",
  focus_mode: false,
};
const DEFAULT_KEYWORD_PREFERENCES: KeywordPreferences = {
  id: null,
  enabled: true,
  user_level: "BEGINNER",
  enabled_categories: [],
  min_confidence: 0.75,
  available_categories: [],
  updated_at: null,
};

type PreferenceSnapshot = Omit<
  AccountReadingPreferencesInput,
  "analytics_enabled" | "use_document_type_defaults"
>;

function buildPreferenceSnapshot({
  ambientEnabled,
  ambientVolume,
  focusMode,
  keywordLevel,
  language,
  masterVolume,
  pageTurnEnabled,
  pageTurnSoundEnabled,
  pageTurnVolume,
  preferences,
  readingMode,
  readingRoom,
}: {
  ambientEnabled: boolean;
  ambientVolume: number;
  focusMode: boolean;
  keywordLevel: AccountReadingPreferencesInput["keyword_level"];
  language: AccountReadingPreferencesInput["language"];
  masterVolume: number;
  pageTurnEnabled: boolean;
  pageTurnSoundEnabled: boolean;
  pageTurnVolume: number;
  preferences: ReadingPreferencesInput;
  readingMode: ReadingMode;
  readingRoom: string;
}): PreferenceSnapshot {
  return {
    ...preferences,
    ambient_sound: ambientEnabled,
    ambient_volume: ambientVolume,
    focus_mode: focusMode,
    keyword_level: keywordLevel,
    language,
    master_volume: masterVolume,
    page_turn_animation: pageTurnEnabled,
    page_turn_sound: pageTurnSoundEnabled,
    page_turn_volume: pageTurnVolume,
    reading_mode: readingMode,
    reading_room: readingRoom,
  };
}

async function fetchAllBlocks(documentId: string): Promise<ContentBlock[]> {
  const firstPage = await fetchBlocks(documentId);
  const blocks = [...firstPage.items];
  while (blocks.length < firstPage.total) {
    const nextPage = await fetchBlocks(documentId, 200, blocks.length);
    blocks.push(...nextPage.items);
  }
  return blocks;
}

function TableOfContents({
  items,
  label,
  onNavigate,
}: {
  items: TocItem[];
  label?: string;
  onNavigate: (item: TocItem) => void;
}) {
  const { t } = useI18n();
  if (items.length === 0) {
    return (
      <p className="text-sm leading-6 text-[var(--reader-muted)]">
        {t("reader", "tocEmpty")}
      </p>
    );
  }
  return (
    <nav aria-label={label ?? t("reader", "toc")}>
      <ol className="space-y-1">
        {items.map((item) => (
          <li key={`${item.block_id}-${item.sequence_number}`}>
            <button
              aria-label={t("reader", "tocItem", {
                title: item.title,
                page: item.page_number,
              })}
              className="w-full py-1.5 text-left text-sm leading-5 hover:text-[var(--reader-accent)]"
              onClick={() => onNavigate(item)}
              style={{ paddingLeft: `${(item.level - 1) * 14}px` }}
              type="button"
            >
              {item.title}
              <span className="ml-2 text-xs text-[var(--reader-muted)]">{item.page_number}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SearchPanel({
  query,
  onQueryChange,
  onSearch,
  results,
  isSearching,
  error,
  onResult,
  onClose,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  results: SearchResult | null;
  isSearching: boolean;
  error: string | null;
  onResult: (block: ContentBlock) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--reader-border)] p-4">
        <h2 className="text-lg font-semibold text-[var(--reader-foreground)]">{t("reader", "panels.search")}</h2>
        <button aria-label={t("reader", "panels.closeSearch")} className="text-[var(--reader-muted)] transition-colors hover:text-[var(--reader-foreground)] lg:hidden" onClick={onClose} title={t("common", "actions.close")} type="button"><X size={20} /></button>
      </div>
      <form className="m-4 flex items-center overflow-hidden rounded-md border border-[var(--reader-border)] focus-within:border-[var(--reader-accent)]" onSubmit={onSearch}>
        <input aria-label={t("reader", "panels.searchDocument")} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none" onChange={(event) => onQueryChange(event.target.value)} placeholder={t("reader", "panels.searchText")} value={query} />
        <button aria-label={t("reader", "panels.runSearch")} className="grid size-10 place-items-center border-l border-[var(--reader-border)]" disabled={isSearching} title={t("reader", "panels.search")} type="submit"><Search size={16} /></button>
      </form>
      {error ? <p className="mt-2 text-sm text-[var(--danger)]" role="alert">{error}</p> : null}
      {results ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-[var(--reader-muted)]">
            {t("reader", "searchResults", { count: results.total })}
          </p>
          <ol className="mt-2 divide-y divide-[var(--reader-border)]">
            {results.items.map((block) => (
              <li key={block.id}>
                <button className="w-full py-3 text-left text-sm leading-5" onClick={() => onResult(block)} type="button">
                  <span className="line-clamp-3">{block.text}</span>
                  <span className="mt-1 block text-xs text-[var(--reader-muted)]">
                    {t("reader", "sourcePage")} {block.source_page_number}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export function DocumentReader({ documentId }: DocumentReaderProps) {
  const { locale, t } = useI18n();
  const {
    room,
    readingMode,
    setReadingMode,
    updatePreferences: updateImmersivePreferences,
    preferences: immersivePrefs,
    reducedMotion,
  } = useReadingRoom();
  const pageTurnSound = useRef<PageTurnSound | null>(null);

  useEffect(() => {
    pageTurnSound.current = new PageTurnSound();

    // Mark interaction on first click for audio autoplay compliance
    const handleInteraction = () => {
      pageTurnSound.current?.markInteraction();
    };
    window.addEventListener("click", handleInteraction, { once: true });

    return () => {
      window.removeEventListener("click", handleInteraction);
      pageTurnSound.current?.destroy();
    };
  }, []);

  useEffect(() => {
    const sound = pageTurnSound.current;
    if (!sound) return;
    sound.setEnabled(immersivePrefs.pageTurnSoundEnabled);
    sound.setVolume(
      immersivePrefs.pageTurnVolume * immersivePrefs.masterVolume,
    );
    const syncVisibility = () => {
      sound.setMuted(
        immersivePrefs.muteAll || window.document.visibilityState === "hidden",
      );
    };
    syncVisibility();
    window.document.addEventListener("visibilitychange", syncVisibility);
    return () =>
      window.document.removeEventListener("visibilitychange", syncVisibility);
  }, [
    immersivePrefs.masterVolume,
    immersivePrefs.muteAll,
    immersivePrefs.pageTurnSoundEnabled,
    immersivePrefs.pageTurnVolume,
  ]);
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [processing, setProcessing] = useState<ProcessingStatus | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [keywords, setKeywords] = useState<KeywordOccurrence[]>([]);
  const [keywordPreferences, setKeywordPreferences] = useState<KeywordPreferences>(DEFAULT_KEYWORD_PREFERENCES);
  const [selectedKeyword, setSelectedKeyword] = useState<KeywordOccurrence | null>(null);
  const [keywordDetail, setKeywordDetail] = useState<KeywordDetail | null>(null);
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const [keywordLoading, setKeywordLoading] = useState(true);
  const [preferences, setPreferences] = useState<ReadingPreferencesInput>(DEFAULT_PREFERENCES);
  const [initialProgress, setInitialProgress] = useState<ProgressInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedBlock, setHighlightedBlock] = useState<string | null>(null);
  const [highlightQuery, setHighlightQuery] = useState("");
  const [activePage, setActivePage] = useState(1);
  const [activeReadingPage, setActiveReadingPage] = useState(1);
  const [bookNavigationTarget, setBookNavigationTarget] = useState<{
    blockId: string;
    requestId: number;
  } | null>(null);
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const [activeToolTab, setActiveToolTab] = useState<ToolTab>("chat");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selection, setSelection] = useState<BlockSelection | null>(null);
  const [progressState, setProgressState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const progressTimerRef = useRef<number | undefined>(undefined);
  const preferencesTimerRef = useRef<number | undefined>(undefined);
  const latestProgressRef = useRef<ProgressInput | null>(null);
  const accountPreferencesLoadedRef = useRef(false);
  const analyticsEnabledRef = useRef(false);
  const savedPreferenceSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const load = () => {
      Promise.all([fetchDocument(documentId), fetchProcessingStatus(documentId)])
        .then(([documentResult, statusResult]) => {
          if (!active) return;
          setDocument(documentResult);
          setProcessing(statusResult);
          setError(null);
          if (PROCESSING_STATES.has(statusResult.status)) {
            timer = window.setTimeout(load, 1500);
            return;
          }
          if (!["READABLE", "AI_READY"].includes(statusResult.status)) return;
          Promise.all([
            fetchToc(documentId),
            fetchAllBlocks(documentId),
            fetchProgress(documentId),
            fetchBookmarks(documentId),
            fetchHighlights(documentId),
            fetchReadingPreferences(),
            fetchDocumentKeywords(documentId),
            fetchKeywordPreferences(),
          ]).then(([tocResult, blockResult, progressResult, bookmarkResult, highlightResult, preferenceResult, keywordResult, keywordPreferenceResult]) => {
            if (!active) return;
            setToc(tocResult.items);
            setBlocks(blockResult);
            setBookmarks(bookmarkResult.items);
            setHighlights(highlightResult.items);
            setKeywords(keywordResult.items);
            setKeywordPreferences(keywordPreferenceResult);
            setKeywordLoading(false);
            const accountVisualPreferences: ReadingPreferencesInput = {
              theme: preferenceResult.theme,
              font_size: preferenceResult.font_size,
              line_height: preferenceResult.line_height,
              reading_width: preferenceResult.reading_width,
              font_family: preferenceResult.font_family,
              focus_mode: preferenceResult.focus_mode,
            };
            const documentType =
              documentResult.processing_result?.effective_document_type ??
              documentResult.document_type_override ??
              documentResult.layout_override ??
              documentResult.layout_type;
            const typeDefaults =
              (preferenceResult.use_document_type_defaults ?? true)
                ? getDocumentReadingDefaults(documentType)
                : null;
            const resolvedVisualPreferences = {
              ...accountVisualPreferences,
              ...typeDefaults?.preferences,
            };
            const resolvedReadingMode = progressResult
              ? normalizeReadingMode(progressResult.reading_mode)
              : typeDefaults?.readingMode ?? preferenceResult.reading_mode;
            setPreferences(resolvedVisualPreferences);
            setActiveToolTab(typeDefaults?.preferredTool ?? "chat");
            updateImmersivePreferences({
              selectedRoom: preferenceResult.reading_room,
              readingMode: resolvedReadingMode,
              pageTurnEnabled: preferenceResult.page_turn_animation,
              pageTurnSoundEnabled: preferenceResult.page_turn_sound,
              ambientEnabled: preferenceResult.ambient_sound,
              masterVolume: preferenceResult.master_volume,
              ambientVolume: preferenceResult.ambient_volume,
              pageTurnVolume: preferenceResult.page_turn_volume,
              focusMode: preferenceResult.focus_mode,
            });
            analyticsEnabledRef.current =
              preferenceResult.analytics_enabled ?? false;
            savedPreferenceSnapshotRef.current = JSON.stringify(
              buildPreferenceSnapshot({
                ambientEnabled: preferenceResult.ambient_sound,
                ambientVolume: preferenceResult.ambient_volume,
                focusMode: preferenceResult.focus_mode,
                keywordLevel: keywordPreferenceResult.user_level,
                language: locale,
                masterVolume: preferenceResult.master_volume,
                pageTurnEnabled: preferenceResult.page_turn_animation,
                pageTurnSoundEnabled: preferenceResult.page_turn_sound,
                pageTurnVolume: preferenceResult.page_turn_volume,
                preferences: resolvedVisualPreferences,
                readingMode: resolvedReadingMode,
                readingRoom: preferenceResult.reading_room,
              }),
            );
            accountPreferencesLoadedRef.current = true;
            if (progressResult) {
              setInitialProgress(progressResult);
              setReadingMode(normalizeReadingMode(progressResult.reading_mode));
            } else {
              const legacy = window.localStorage.getItem(`nexaread:reader-progress:${documentId}`);
              if (legacy) {
                try {
                  const parsed = JSON.parse(legacy) as Partial<ProgressInput>;
                  setInitialProgress({
                    document_version_id: documentResult.versions.at(-1)?.id ?? "",
                    last_block_id: parsed.last_block_id ?? null,
                    page_number: parsed.page_number ?? 1,
                    progress_percent: parsed.progress_percent ?? 0,
                    scroll_offset: parsed.scroll_offset ?? 0,
                    reading_mode: "clean",
                  });
                } catch {
                  window.localStorage.removeItem(`nexaread:reader-progress:${documentId}`);
                }
              }
            }
          }).catch((loadError: unknown) => {
            if (active) {
              setError(
                loadError instanceof Error
                  ? loadError.message
                  : t("reader", "loadContentError"),
              );
            }
          });
        })
        .catch((loadError: unknown) => {
          if (active) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : t("reader", "loadReaderError"),
            );
          }
        });
    };
    timer = window.setTimeout(load, 0);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    documentId,
    locale,
    setReadingMode,
    t,
    updateImmersivePreferences,
  ]);

  const visibleBlocks = useMemo(() => blocks.filter((block) => block.metadata.suppressed !== true), [blocks]);
  const blocksById = useMemo(() => new Map(visibleBlocks.map((block) => [block.id, block])), [visibleBlocks]);
  const highlightsByBlock = useMemo(() => {
    const grouped = new Map<string, Highlight[]>();
    highlights.forEach((highlight) => grouped.set(highlight.content_block_id, [...(grouped.get(highlight.content_block_id) ?? []), highlight]));
    return grouped;
  }, [highlights]);
  const keywordsByBlock = useMemo(() => {
    const grouped = new Map<string, KeywordOccurrence[]>();
    keywords.forEach((keyword) => grouped.set(keyword.content_block_id, [...(grouped.get(keyword.content_block_id) ?? []), keyword]));
    return grouped;
  }, [keywords]);
  const bookmarkByBlock = useMemo(() => new Map(bookmarks.map((bookmark) => [bookmark.content_block_id, bookmark])), [bookmarks]);
  const bookmarkedBlocks = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.content_block_id, true])),
    [bookmarks],
  );

  // TanStack Virtual owns mutable measurement functions that React Compiler must not memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visibleBlocks.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => {
      const type = visibleBlocks[index]?.block_type;
      return type?.startsWith("HEADING") ? 92 : type === "CODE" || type === "TABLE" ? 180 : 76;
    },
    getItemKey: (index) => visibleBlocks[index]?.id ?? index,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const readerScrollOffset = virtualizer.scrollOffset ?? 0;
  const currentVirtualItem =
    virtualItems.find((item) => item.end >= readerScrollOffset + 16) ?? virtualItems[0];
  const currentVirtualIndex = currentVirtualItem?.index ?? -1;

  const navigate = useCallback(async (blockId: string, searchTerm = "") => {
    const block = await navigateToBlock(blockId, visibleBlocks, virtualizer);
    if (!block) return;
    setHighlightedBlock(block.id);
    setHighlightQuery(searchTerm);
    setActivePage(block.source_page_number || block.page_number);
    setActiveReadingPage(Math.max(1, visibleBlocks.indexOf(block) + 1));
    setBookNavigationTarget((current) => ({
      blockId: block.id,
      requestId: (current?.requestId ?? 0) + 1,
    }));
    setMobilePanel(null);
  }, [virtualizer, visibleBlocks]);

  useEffect(() => {
    if (restoredRef.current || visibleBlocks.length === 0) return;
    restoredRef.current = true;
    if (initialProgress?.last_block_id) {
      void navigate(initialProgress.last_block_id);
      setActivePage(initialProgress.page_number);
    } else if (initialProgress?.scroll_offset && scrollParentRef.current) {
      scrollParentRef.current.scrollTop = initialProgress.scroll_offset;
    }
  }, [initialProgress, navigate, visibleBlocks.length]);

  const persistProgress = useCallback(async () => {
    const pending = latestProgressRef.current;
    if (!pending) return;
    setProgressState("saving");
    try {
      await saveProgress(documentId, pending);
      window.localStorage.removeItem(`nexaread:reader-progress:${documentId}`);
      setProgressState("saved");
    } catch {
      setProgressState("failed");
    }
  }, [documentId]);

  useEffect(() => {
    if (!restoredRef.current || currentVirtualIndex < 0 || !document) return;
    const block = visibleBlocks[currentVirtualIndex];
    const versionId = document.versions.at(-1)?.id;
    if (!block || !versionId) return;
    setActivePage(block.source_page_number || block.page_number);
    setActiveReadingPage(currentVirtualIndex + 1);
    latestProgressRef.current = {
      document_version_id: versionId,
      last_block_id: block.id,
      page_number: block.source_page_number || block.page_number,
      progress_percent: visibleBlocks.length ? Math.round(((currentVirtualIndex + 1) / visibleBlocks.length) * 100) : 0,
      scroll_offset: readerScrollOffset,
      reading_mode: readingMode,
    };
    setProgressState("idle");
    if (progressTimerRef.current !== undefined) window.clearTimeout(progressTimerRef.current);
    progressTimerRef.current = window.setTimeout(() => void persistProgress(), 1500);
  }, [
    currentVirtualIndex,
    document,
    persistProgress,
    readingMode,
    readerScrollOffset,
    visibleBlocks,
  ]);

  useEffect(() => {
    const handleVisibility = () => {
      if (window.document.visibilityState === "hidden") void persistProgress();
    };
    window.document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.document.removeEventListener("visibilitychange", handleVisibility);
      if (progressTimerRef.current !== undefined) window.clearTimeout(progressTimerRef.current);
      if (preferencesTimerRef.current !== undefined) window.clearTimeout(preferencesTimerRef.current);
    };
  }, [persistProgress]);

  function changePreferences(next: ReadingPreferencesInput) {
    setPreferences(next);
  }

  useEffect(() => {
    if (!accountPreferencesLoadedRef.current) return;
    const snapshot = buildPreferenceSnapshot({
      ambientEnabled: immersivePrefs.ambientEnabled,
      ambientVolume: immersivePrefs.ambientVolume,
      focusMode: immersivePrefs.focusMode,
      keywordLevel: keywordPreferences.user_level,
      language: locale,
      masterVolume: immersivePrefs.masterVolume,
      pageTurnEnabled: immersivePrefs.pageTurnEnabled,
      pageTurnSoundEnabled: immersivePrefs.pageTurnSoundEnabled,
      pageTurnVolume: immersivePrefs.pageTurnVolume,
      preferences,
      readingMode,
      readingRoom: immersivePrefs.selectedRoom,
    });
    const serializedSnapshot = JSON.stringify(snapshot);
    if (serializedSnapshot === savedPreferenceSnapshotRef.current) return;
    if (preferencesTimerRef.current !== undefined) window.clearTimeout(preferencesTimerRef.current);
    preferencesTimerRef.current = window.setTimeout(() => {
      savedPreferenceSnapshotRef.current = serializedSnapshot;
      void saveReadingPreferences({
        ...snapshot,
        analytics_enabled: analyticsEnabledRef.current,
        use_document_type_defaults: false,
      }).catch(() => {
        if (savedPreferenceSnapshotRef.current === serializedSnapshot) {
          savedPreferenceSnapshotRef.current = null;
        }
      });
    }, 650);
  }, [
    immersivePrefs.ambientEnabled,
    immersivePrefs.ambientVolume,
    immersivePrefs.focusMode,
    immersivePrefs.masterVolume,
    immersivePrefs.pageTurnEnabled,
    immersivePrefs.pageTurnSoundEnabled,
    immersivePrefs.pageTurnVolume,
    immersivePrefs.selectedRoom,
    keywordPreferences.user_level,
    locale,
    preferences,
    readingMode,
  ]);

  async function toggleBookmark(block: ContentBlock) {
    const existing = bookmarkByBlock.get(block.id);
    if (existing) {
      await deleteBookmark(existing.id);
      setBookmarks((items) => items.filter((item) => item.id !== existing.id));
      return;
    }
    const versionId = document?.versions.at(-1)?.id;
    if (!versionId) return;
    const bookmark = await createBookmark(documentId, {
      document_version_id: versionId,
      content_block_id: block.id,
      title: block.text.slice(0, 120),
    });
    setBookmarks((items) => [...items, bookmark]);
  }

  async function addHighlight(color: HighlightColor) {
    if (!selection) return;
    const versionId = document?.versions.at(-1)?.id;
    if (!versionId) return;
    const highlight = await createHighlight(documentId, {
      document_version_id: versionId,
      content_block_id: selection.block.id,
      start_offset: selection.startOffset,
      end_offset: selection.endOffset,
      selected_text: selection.selectedText,
      color,
    });
    setHighlights((items) => [...items, highlight]);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  async function removeHighlight(highlight: Highlight) {
    await deleteHighlight(highlight.id);
    setHighlights((items) => items.filter((item) => item.id !== highlight.id));
  }

  async function saveNoteForHighlight(highlight: Highlight, content: string) {
    const note = highlight.note
      ? await updateNote(highlight.note.id, content)
      : await createNote(highlight.id, content);
    setHighlights((items) => items.map((item) => item.id === highlight.id ? { ...item, note } : item));
  }

  async function removeNoteFromHighlight(highlight: Highlight) {
    if (!highlight.note) return;
    await deleteNote(highlight.note.id);
    setHighlights((items) => items.map((item) => item.id === highlight.id ? { ...item, note: null } : item));
  }

  async function selectKeyword(occurrence: KeywordOccurrence) {
    setSelectedKeyword(occurrence);
    setKeywordError(null);
    try {
      setKeywordDetail(await fetchKeywordDetail(occurrence.keyword.id));
      if (window.innerWidth < 1024) setMobilePanel("keywords");
    } catch (selectionError) {
      setKeywordError(
        selectionError instanceof Error
          ? selectionError.message
          : t("reader", "glossaryLoadError"),
      );
    }
  }

  async function changeKeywordPreferences(next: KeywordPreferencesInput) {
    setKeywordLoading(true);
    setKeywordError(null);
    try {
      const saved = await saveKeywordPreferences(next);
      const refreshed = await fetchDocumentKeywords(documentId);
      setKeywordPreferences(saved);
      setKeywords(refreshed.items);
      if (selectedKeyword) setKeywordDetail(await fetchKeywordDetail(selectedKeyword.keyword.id));
    } catch (preferenceError) {
      setKeywordError(
        preferenceError instanceof Error
          ? preferenceError.message
          : t("reader", "glossarySaveError"),
      );
    } finally {
      setKeywordLoading(false);
    }
  }

  async function sendKeywordFeedback(
    occurrence: KeywordOccurrence,
    feedbackType: KeywordFeedbackType,
  ) {
    await createKeywordFeedback({
      document_id: documentId,
      occurrence_id: occurrence.id,
      feedback_type: feedbackType,
    });
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    if (normalized.length < 2) {
      setSearchError(t("reader", "searchMinimum"));
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    try {
      setResults(await searchDocument(documentId, normalized));
    } catch (searchFailure) {
      setSearchError(
        searchFailure instanceof Error
          ? searchFailure.message
          : t("reader", "searchFailed"),
      );
    } finally {
      setIsSearching(false);
    }
  }

  const handleBookPageChange = useCallback((pageNumber: number, blockId: string, readingPageNumber: number) => {
    setActivePage(pageNumber);
    setActiveReadingPage(readingPageNumber);
    const versionId = document?.versions.at(-1)?.id;
    if (!versionId) return;
    latestProgressRef.current = {
      document_version_id: versionId,
      last_block_id: blockId,
      page_number: pageNumber,
      progress_percent: processing?.page_count ? Math.round((pageNumber / processing.page_count) * 100) : 0,
      scroll_offset: 0,
      reading_mode: readingMode,
    };
    setProgressState("idle");
    if (progressTimerRef.current !== undefined) window.clearTimeout(progressTimerRef.current);
    progressTimerRef.current = window.setTimeout(() => void persistProgress(), 1500);
  }, [document, processing, readingMode, persistProgress]);

  if (error) return <p className="w-full border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-5" role="alert">{error}</p>;
  if (!document || !processing) return <div aria-label={t("reader", "loading")} className="h-72 w-full animate-pulse bg-[var(--surface-muted)]" />;
  const pdfLink = originalPdfUrl(documentId);
  if (processing.status === "OCR_REQUIRED") return <ReaderState pdfLink={pdfLink} title={document.title}>{t("reader", "ocrRequired")}</ReaderState>;
  if (processing.status === "FAILED") return <ReaderState pdfLink={pdfLink} title={document.title} tone="danger">{t("reader", "processingFailed")}</ReaderState>;
  if (PROCESSING_STATES.has(processing.status)) {
    return <div className="w-full"><ReaderToolbar activePage={activePage} backHref={`/documents/${document.id}`} pageCount={processing.page_count} progressState="idle" title={document.title} /><section className="mt-10 border-y border-[var(--border)] py-10" aria-live="polite"><p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">{t("reader", "processing")}</p><h2 className="mt-2 text-2xl font-semibold">{t("reader", `processingStages.${processing.stage.toUpperCase()}`)}</h2><div className="mt-5 h-2 max-w-xl bg-[var(--surface-muted)]"><div className="h-full bg-[var(--accent)]" style={{ width: `${processing.progress}%` }} /></div><p className="mt-2 text-sm text-[var(--muted)]">{processing.progress}% {t("reader", "progressComplete")}</p></section></div>;
  }

  const effectiveDocumentType =
    document.processing_result?.effective_document_type ??
    document.document_type_override ??
    document.layout_override ??
    document.layout_type;
  const documentDefaults = getDocumentReadingDefaults(effectiveDocumentType);
  const isResearchDocument = documentDefaults?.preferredTool === "references";
  const contentsLabel =
    documentDefaults?.navigationStyle === "legal"
      ? t("reader", "panels.legalContents")
      : t("reader", "panels.contents");
  const searchPanel = <SearchPanel error={searchError} isSearching={isSearching} onClose={() => setMobilePanel(null)} onQueryChange={setQuery} onResult={(block) => void navigate(block.id, results?.query)} onSearch={handleSearch} query={query} results={results} />;
  const annotationPanel = <AnnotationPanel blocksById={blocksById} bookmarks={bookmarks} highlights={highlights} onDeleteBookmark={(bookmark) => void toggleBookmark(blocksById.get(bookmark.content_block_id)!)} onDeleteHighlight={(highlight) => void removeHighlight(highlight)} onDeleteNote={removeNoteFromHighlight} onNavigate={(blockId) => void navigate(blockId)} onSaveNote={saveNoteForHighlight} />;
  const keywordPanel = <KeywordGlossary detail={keywordDetail} error={keywordError} loading={keywordLoading} occurrences={keywords} onFeedback={sendKeywordFeedback} onNavigate={(occurrence) => void navigate(occurrence.content_block_id)} onPreferences={(next) => void changeKeywordPreferences(next)} onSelect={(occurrence) => void selectKeyword(occurrence)} preferences={keywordPreferences} selected={selectedKeyword} />;
  const chatPanel = <DocumentChat documentId={documentId} onCitation={(blockId) => void navigate(blockId)} />;
  const referencePanel = <ResearchReferencePanel blocks={visibleBlocks} onNavigate={(blockId) => void navigate(blockId)} toc={toc} />;
  const activeToolPanel =
    activeToolTab === "chat"
      ? chatPanel
      : activeToolTab === "search"
        ? searchPanel
        : activeToolTab === "annotations"
          ? annotationPanel
          : activeToolTab === "references"
            ? referencePanel
            : keywordPanel;

  const preset = getPresetById(immersivePrefs.typographyPreset || room.typographyPreset);
  const fontFamily = resolveReaderFontFamily(
    preferences.font_family,
    preset.fontBody,
  );
  const isFocusMode = immersivePrefs.focusMode;
  const isOriginalMode = readingMode === "original";
  const isStudyMode = readingMode === "study";
  const showToc = !isFocusMode && !isOriginalMode && !isStudyMode;
  const showStudyTools = !isFocusMode && (isStudyMode || !isOriginalMode);
  const currentChapter =
    [...toc].reverse().find((item) => item.page_number <= activePage)?.title ??
    null;
  const gridClass =
    isOriginalMode || (isFocusMode && !isStudyMode)
      ? "grid-cols-[minmax(0,1fr)]"
      : isStudyMode
        ? "lg:grid-cols-[minmax(520px,1fr)_320px]"
        : tocCollapsed
          ? "lg:grid-cols-[52px_minmax(520px,1fr)_320px]"
          : "lg:grid-cols-[220px_minmax(520px,1fr)_320px]";
  const toolTabs: Array<[ToolTab, string]> = [
    ["chat", t("reader", "panels.ask")],
    ["search", t("reader", "panels.search")],
    ["annotations", t("reader", "panels.annotations")],
    ["keywords", t("reader", "panels.terms")],
  ];
  if (isResearchDocument) {
    toolTabs.splice(1, 0, [
      "references",
      t("reader", "panels.references"),
    ]);
  }

  const scrollModeContent = (
    <div
      aria-label={t("reader", "virtualContent")}
      className="h-[calc(100vh-12rem)] min-h-[520px] overflow-y-auto overscroll-contain border-x border-[var(--reader-border)] bg-[var(--reader-surface)]"
      ref={scrollParentRef}
      style={{ fontFamily, fontSize: `${preferences.font_size}px`, lineHeight: preferences.line_height }}
    >
      <article className="relative mx-auto px-5 py-8 sm:px-10" style={{ height: `${virtualizer.getTotalSize()}px`, maxWidth: `${preferences.reading_width}px` }}>
        {virtualItems.map((virtualItem) => {
          const block = visibleBlocks[virtualItem.index];
          return (
            <div
              data-index={virtualItem.index}
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              style={{ left: 0, position: "absolute", top: 0, transform: `translateY(${virtualItem.start}px)`, width: "100%" }}
            >
              <ReaderBlock block={block} bookmarked={bookmarkByBlock.has(block.id)} highlighted={highlightedBlock === block.id} highlights={highlightsByBlock.get(block.id) ?? []} keywords={keywordPreferences.enabled ? keywordsByBlock.get(block.id) ?? [] : []} onBookmark={(item) => void toggleBookmark(item)} onKeywordSelect={(occurrence) => void selectKeyword(occurrence)} onSelection={setSelection} query={highlightQuery} />
            </div>
          );
        })}
      </article>
    </div>
  );

  return (
    <div className="reader-theme w-full" data-theme={preferences.theme}>
      <ReaderToolbar
        activePage={activePage}
        backHref={`/documents/${document.id}`}
        chapterTitle={currentChapter}
        pageCount={processing.page_count}
        progressState={progressState}
        readingPage={activeReadingPage}
        title={document.title}
      >
        <div
          className="relative"
          onKeyDown={(event) => {
            if (event.key === "Escape") setSettingsOpen(false);
          }}
        >
          <button
            aria-controls="reader-settings-popover"
            aria-expanded={settingsOpen}
            aria-label={t("reader", "panels.settings")}
            className="hidden size-11 place-items-center rounded-lg border border-[var(--reader-border)] focus-visible:ring-2 focus-visible:ring-[var(--reader-accent)] sm:grid"
            onClick={() => setSettingsOpen((open) => !open)}
            title={t("reader", "panels.settings")}
            type="button"
          >
            <Settings2 size={17} />
          </button>
          {settingsOpen ? (
            <div
              aria-label={t("reader", "panels.settings")}
              className="absolute right-0 top-12 z-40 w-72 rounded-lg border border-[var(--reader-border)] bg-[var(--reader-surface)] p-4 shadow-xl"
              id="reader-settings-popover"
              role="group"
            >
              <ReaderSettings
                onChange={changePreferences}
                preferences={preferences}
              />
            </div>
          ) : null}
        </div>
      </ReaderToolbar>

      {!isFocusMode ? <div className="mt-4 flex gap-2 lg:hidden px-4">
        <MobileToolButton icon={<Menu size={17} />} label={contentsLabel} onClick={() => setMobilePanel("toc")} />
        <MobileToolButton icon={<MessageSquare size={17} />} label={t("reader", "panels.ask")} onClick={() => setMobilePanel("chat")} />
        {isResearchDocument ? <MobileToolButton icon={<LibraryBig size={17} />} label={t("reader", "panels.references")} onClick={() => setMobilePanel("references")} /> : null}
        <MobileToolButton icon={<Search size={17} />} label={t("reader", "panels.search")} onClick={() => setMobilePanel("search")} />
        <MobileToolButton icon={<Tags size={17} />} label={t("reader", "panels.terms")} onClick={() => setMobilePanel("keywords")} />
        <MobileToolButton icon={<StickyNote size={17} />} label={t("reader", "panels.annotations")} onClick={() => setMobilePanel("annotations")} />
        <MobileToolButton icon={<Settings2 size={17} />} label={t("reader", "panels.settings")} onClick={() => setMobilePanel("settings")} />
      </div> : null}

      <div className={`mt-5 grid items-start gap-7 ${gridClass}`}>
        {showToc ? (
          <aside
            aria-label={contentsLabel}
            className="sticky top-4 hidden max-h-[calc(100vh-3rem)] overflow-y-auto border-r border-[var(--reader-border)] px-2 lg:block"
          >
            <button
              aria-expanded={!tocCollapsed}
              aria-label={tocCollapsed ? t("reader", "panels.expandContents") : t("reader", "panels.collapseContents")}
              className="mb-4 grid size-11 place-items-center rounded-lg border border-[var(--reader-border)] focus-visible:ring-2 focus-visible:ring-[var(--reader-accent)]"
              onClick={() => setTocCollapsed((value) => !value)}
              type="button"
            >
              {tocCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            {!tocCollapsed ? <><h2 className="mb-4 text-xs font-semibold uppercase text-[var(--reader-muted)]">{contentsLabel}</h2><TableOfContents items={toc} label={contentsLabel} onNavigate={(item) => void navigate(item.block_id)} /></> : null}
          </aside>
        ) : null}

        <main className="min-w-0 h-[calc(100vh-8rem)]">
          {readingMode === "original" ? (
            <div className="h-full w-full border border-[var(--reader-border)] bg-white rounded-md overflow-hidden shadow-sm">
              <iframe
                src={pdfLink}
                className="w-full h-full border-none"
                title={t("reader", "toolbar.originalMode")}
              />
            </div>
          ) : readingMode === "clean" || readingMode === "study" ? (
            scrollModeContent
          ) : (
            <BookReader
              animationEnabled={immersivePrefs.pageTurnEnabled}
              blocks={visibleBlocks}
              bookmarks={bookmarkedBlocks}
              contentRevision={
                document.versions.at(-1)?.content_hash ?? document.updated_at
              }
              documentTitle={document.title}
              documentVersionId={document.versions.at(-1)?.id ?? document.id}
              fontFamily={fontFamily}
              fontSize={preferences.font_size}
              highlightQuery={highlightQuery}
              highlightedBlock={highlightedBlock}
              highlights={highlightsByBlock}
              initialPage={Math.max(0, activePage - 1)}
              initialBlockId={bookNavigationTarget?.blockId ?? null}
              key={`book-reader-${bookNavigationTarget?.requestId ?? 0}`}
              keywords={keywordsByBlock}
              keywordsEnabled={keywordPreferences.enabled}
              lineHeight={preferences.line_height}
              onBookmark={(item) => void toggleBookmark(item)}
              onKeywordSelect={(occurrence) => void selectKeyword(occurrence)}
              onPageChange={handleBookPageChange}
              onPageTurnSound={() => pageTurnSound.current?.play()}
              onSelection={setSelection}
              pageColor={
                preferences.theme === "light"
                  ? room.pageColor
                  : "var(--reader-surface)"
              }
              pageTextureOpacity={room.pageTextureOpacity}
              readingWidth={preferences.reading_width}
              reducedMotion={reducedMotion}
            />
          )}
        </main>

        {showStudyTools ? (
          <aside aria-label={t("reader", "panels.studyTools")} className="sticky top-4 hidden max-h-[calc(100vh-3rem)] overflow-y-auto pr-4 lg:block">
            <div
              aria-label={t("reader", "panels.toolTabs")}
              className="sticky top-0 z-10 grid border border-[var(--reader-border)] bg-[var(--reader-surface)]"
              role="tablist"
              style={{ gridTemplateColumns: `repeat(${toolTabs.length}, minmax(0, 1fr))` }}
            >
              {toolTabs.map(([tab, label]) => (
                <button
                  aria-controls={`reader-tool-${tab}`}
                  aria-selected={activeToolTab === tab}
                  className="min-h-11 border-r border-[var(--reader-border)] px-1 text-xs last:border-r-0 aria-selected:bg-[var(--reader-surface-muted)] aria-selected:font-semibold"
                  id={`reader-tab-${tab}`}
                  key={tab}
                  onClick={() => setActiveToolTab(tab)}
                  role="tab"
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              aria-labelledby={`reader-tab-${activeToolTab}`}
              className="pt-4"
              id={`reader-tool-${activeToolTab}`}
              role="tabpanel"
            >
              {activeToolPanel}
            </div>
          </aside>
        ) : null}
      </div>
      {selection ? <SelectionToolbar onCancel={() => setSelection(null)} onCreate={(color) => void addHighlight(color)} selection={selection} /> : null}
      {mobilePanel ? <MobilePanelDialog onClose={() => setMobilePanel(null)} title={mobilePanel === "toc" ? contentsLabel : mobilePanel === "chat" ? t("reader", "panels.ask") : mobilePanel === "references" ? t("reader", "panels.references") : mobilePanel === "search" ? t("reader", "panels.searchDocument") : mobilePanel === "keywords" ? t("reader", "panels.terms") : mobilePanel === "annotations" ? t("reader", "panels.annotations") : t("reader", "panels.settings")}>{mobilePanel === "toc" ? <TableOfContents items={toc} label={contentsLabel} onNavigate={(item) => void navigate(item.block_id)} /> : mobilePanel === "chat" ? chatPanel : mobilePanel === "references" ? referencePanel : mobilePanel === "search" ? searchPanel : mobilePanel === "keywords" ? keywordPanel : mobilePanel === "annotations" ? annotationPanel : <ReaderSettings onChange={changePreferences} preferences={preferences} />}</MobilePanelDialog> : null}
    </div>
  );
}

function MobileToolButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button aria-label={label} className="grid size-10 place-items-center border border-[var(--reader-border)] bg-[var(--reader-surface)]" onClick={onClick} title={label} type="button">{icon}</button>;
}

function MobilePanelDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const dialogRef = useDialogFocusTrap(true, onClose);
  return <div aria-label={t("reader", "panels.tools")} aria-modal="true" className="fixed inset-0 z-40 bg-black/40 lg:hidden" ref={dialogRef} role="dialog" tabIndex={-1}><div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto bg-[var(--reader-surface)] p-5 text-[var(--reader-foreground)]"><div className="mb-5 flex items-center justify-between border-b border-[var(--reader-border)] pb-4"><h2 className="font-semibold">{title}</h2><button aria-label={t("reader", "panels.closeTools")} className="grid size-11 place-items-center" onClick={onClose} title={t("common", "actions.close")} type="button"><X size={19} /></button></div>{children}</div></div>;
}

function ReaderState({ title, pdfLink, tone = "notice", children }: { title: string; pdfLink: string; tone?: "notice" | "danger"; children: ReactNode }) {
  const { t } = useI18n();
  const colors = tone === "danger" ? "border-[var(--danger)] bg-[var(--danger-soft)]" : "border-[var(--notice)] bg-[var(--notice-soft)]";
  return <div className="w-full"><Link className="text-sm font-semibold text-[var(--accent-strong)]" href="/library">{t("library", "back")}</Link><h1 className="mt-4 text-3xl font-semibold">{title}</h1><section className={`mt-8 border-l-4 p-6 ${colors}`} role="status"><p className="leading-7">{children}</p><a className="mt-5 inline-flex border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold" href={pdfLink} rel="noreferrer" target="_blank">{t("reader", "viewOriginal")}</a></section></div>;
}

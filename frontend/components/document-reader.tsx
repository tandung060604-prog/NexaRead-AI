"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Menu, MessageSquare, Search, Settings2, StickyNote, Tags, X } from "lucide-react";
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

import {
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
import { navigateToBlock } from "@/lib/reader-navigation";

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
import { useReadingRoom } from "./reading-room-provider";
import { PageTurnSound } from "@/lib/page-turn-sound";
import { getPresetById } from "@/config/typography-presets";

type DocumentReaderProps = { documentId: string };
type MobilePanel = "toc" | "chat" | "search" | "keywords" | "annotations" | "settings" | null;

const PROCESSING_STATES = new Set(["UPLOADED", "QUEUED", "EXTRACTING", "STRUCTURING", "INDEXING"]);
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

async function fetchAllBlocks(documentId: string): Promise<ContentBlock[]> {
  const firstPage = await fetchBlocks(documentId);
  const blocks = [...firstPage.items];
  while (blocks.length < firstPage.total) {
    const nextPage = await fetchBlocks(documentId, 200, blocks.length);
    blocks.push(...nextPage.items);
  }
  return blocks;
}

function TableOfContents({ items, onNavigate }: { items: TocItem[]; onNavigate: (item: TocItem) => void }) {
  if (items.length === 0) {
    return <p className="text-sm leading-6 text-[var(--reader-muted)]">No table of contents detected.</p>;
  }
  return (
    <nav aria-label="Table of contents">
      <ol className="space-y-1">
        {items.map((item) => (
          <li key={`${item.block_id}-${item.sequence_number}`}>
            <button
              aria-label={`${item.title}, page ${item.page_number}`}
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
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--reader-border)] p-4">
        <h2 className="text-lg font-semibold text-[var(--reader-foreground)]">Search</h2>
        <button aria-label="Close search" className="text-[var(--reader-muted)] transition-colors hover:text-[var(--reader-foreground)] lg:hidden" onClick={onClose} title="Close" type="button"><X size={20} /></button>
      </div>
      <form className="m-4 flex items-center overflow-hidden rounded-md border border-[var(--reader-border)] focus-within:border-[var(--reader-accent)]" onSubmit={onSearch}>
        <input aria-label="Search document" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none" onChange={(event) => onQueryChange(event.target.value)} placeholder="Search text" value={query} />
        <button aria-label="Run search" className="grid size-10 place-items-center border-l border-[var(--reader-border)]" disabled={isSearching} title="Search" type="submit"><Search size={16} /></button>
      </form>
      {error ? <p className="mt-2 text-sm text-[var(--danger)]" role="alert">{error}</p> : null}
      {results ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-[var(--reader-muted)]">{results.total} results</p>
          <ol className="mt-2 divide-y divide-[var(--reader-border)]">
            {results.items.map((block) => (
              <li key={block.id}>
                <button className="w-full py-3 text-left text-sm leading-5" onClick={() => onResult(block)} type="button">
                  <span className="line-clamp-3">{block.text}</span>
                  <span className="mt-1 block text-xs text-[var(--reader-muted)]">Page {block.page_number}</span>
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
  const { room, readingMode, preferences: immersivePrefs, reducedMotion } = useReadingRoom();
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
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [selection, setSelection] = useState<BlockSelection | null>(null);
  const [progressState, setProgressState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const progressTimerRef = useRef<number | undefined>(undefined);
  const preferencesTimerRef = useRef<number | undefined>(undefined);
  const latestProgressRef = useRef<ProgressInput | null>(null);

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
            setPreferences({
              theme: preferenceResult.theme,
              font_size: preferenceResult.font_size,
              line_height: preferenceResult.line_height,
              reading_width: preferenceResult.reading_width,
              font_family: preferenceResult.font_family,
              focus_mode: preferenceResult.focus_mode,
            });
            if (progressResult) {
              setInitialProgress(progressResult);
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
                    reading_mode: "standard",
                  });
                } catch {
                  window.localStorage.removeItem(`nexaread:reader-progress:${documentId}`);
                }
              }
            }
          }).catch((loadError: unknown) => {
            if (active) setError(loadError instanceof Error ? loadError.message : "Could not load reader content.");
          });
        })
        .catch((loadError: unknown) => {
          if (active) setError(loadError instanceof Error ? loadError.message : "Could not load document reader.");
        });
    };
    timer = window.setTimeout(load, 0);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [documentId]);

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
    setActivePage(block.page_number);
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
    setActivePage(block.page_number);
    latestProgressRef.current = {
      document_version_id: versionId,
      last_block_id: block.id,
      page_number: block.page_number,
      progress_percent: visibleBlocks.length ? Math.round(((currentVirtualIndex + 1) / visibleBlocks.length) * 100) : 0,
      scroll_offset: readerScrollOffset,
      reading_mode: preferences.focus_mode ? "focus" : "standard",
    };
    setProgressState("idle");
    if (progressTimerRef.current !== undefined) window.clearTimeout(progressTimerRef.current);
    progressTimerRef.current = window.setTimeout(() => void persistProgress(), 1500);
  }, [
    currentVirtualIndex,
    document,
    persistProgress,
    preferences.focus_mode,
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
    if (preferencesTimerRef.current !== undefined) window.clearTimeout(preferencesTimerRef.current);
    preferencesTimerRef.current = window.setTimeout(() => void saveReadingPreferences(next), 650);
  }

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
      setKeywordError(selectionError instanceof Error ? selectionError.message : "Could not load glossary entry.");
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
      setKeywordError(preferenceError instanceof Error ? preferenceError.message : "Could not save keyword settings.");
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
      setSearchError("Enter at least 2 characters.");
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    try {
      setResults(await searchDocument(documentId, normalized));
    } catch (searchFailure) {
      setSearchError(searchFailure instanceof Error ? searchFailure.message : "Search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  const handleBookPageChange = useCallback((pageNumber: number, blockId: string) => {
    setActivePage(pageNumber);
    const versionId = document?.versions.at(-1)?.id;
    if (!versionId) return;
    latestProgressRef.current = {
      document_version_id: versionId,
      last_block_id: blockId,
      page_number: pageNumber,
      progress_percent: processing?.page_count ? Math.round((pageNumber / processing.page_count) * 100) : 0,
      scroll_offset: 0,
      reading_mode: immersivePrefs.focusMode ? "focus" : "standard",
    };
    setProgressState("idle");
    if (progressTimerRef.current !== undefined) window.clearTimeout(progressTimerRef.current);
    progressTimerRef.current = window.setTimeout(() => void persistProgress(), 1500);
  }, [document, processing, immersivePrefs.focusMode, persistProgress]);

  if (error) return <p className="w-full border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-5" role="alert">{error}</p>;
  if (!document || !processing) return <div aria-label="Loading reader" className="h-72 w-full animate-pulse bg-[var(--surface-muted)]" />;
  const pdfLink = originalPdfUrl(documentId);
  if (processing.status === "OCR_REQUIRED") return <ReaderState pdfLink={pdfLink} title={document.title}>PDF này không chứa đủ nội dung text để trích xuất. OCR chưa được hỗ trợ, nhưng bạn vẫn có thể xem bản PDF gốc.</ReaderState>;
  if (processing.status === "FAILED") return <ReaderState pdfLink={pdfLink} title={document.title} tone="danger">Không thể xử lý tài liệu. File gốc vẫn được giữ an toàn.</ReaderState>;
  if (PROCESSING_STATES.has(processing.status)) {
    return <div className="w-full"><ReaderToolbar activePage={activePage} backHref={`/documents/${document.id}`} pageCount={processing.page_count} progressState="idle" title={document.title} /><section className="mt-10 border-y border-[var(--border)] py-10" aria-live="polite"><p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">Processing document</p><h2 className="mt-2 text-2xl font-semibold">{processing.stage}</h2><div className="mt-5 h-2 max-w-xl bg-[var(--surface-muted)]"><div className="h-full bg-[var(--accent)]" style={{ width: `${processing.progress}%` }} /></div><p className="mt-2 text-sm text-[var(--muted)]">{processing.progress}% complete</p></section></div>;
  }

  const searchPanel = <SearchPanel error={searchError} isSearching={isSearching} onClose={() => setMobilePanel(null)} onQueryChange={setQuery} onResult={(block) => void navigate(block.id, results?.query)} onSearch={handleSearch} query={query} results={results} />;
  const annotationPanel = <AnnotationPanel blocksById={blocksById} bookmarks={bookmarks} highlights={highlights} onDeleteBookmark={(bookmark) => void toggleBookmark(blocksById.get(bookmark.content_block_id)!)} onDeleteHighlight={(highlight) => void removeHighlight(highlight)} onDeleteNote={removeNoteFromHighlight} onNavigate={(blockId) => void navigate(blockId)} onSaveNote={saveNoteForHighlight} />;
  const keywordPanel = <KeywordGlossary detail={keywordDetail} error={keywordError} loading={keywordLoading} occurrences={keywords} onFeedback={sendKeywordFeedback} onNavigate={(occurrence) => void navigate(occurrence.content_block_id)} onPreferences={(next) => void changeKeywordPreferences(next)} onSelect={(occurrence) => void selectKeyword(occurrence)} preferences={keywordPreferences} selected={selectedKeyword} />;
  const chatPanel = <DocumentChat documentId={documentId} onCitation={(blockId) => void navigate(blockId)} />;

  const preset = getPresetById(immersivePrefs.typographyPreset || room.typographyPreset);
  const fontFamily = preset.fontBody;
  const isFocusMode = immersivePrefs.focusMode;
  const gridClass = isFocusMode ? "grid-cols-[minmax(0,1fr)]" : "lg:grid-cols-[220px_minmax(520px,1fr)_280px]";

  const scrollModeContent = (
    <div
      aria-label="Virtualized document content"
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
      <ReaderToolbar activePage={activePage} backHref={`/documents/${document.id}`} pageCount={processing.page_count} progressState={progressState} title={document.title} />

      <div className="mt-4 flex gap-2 lg:hidden px-4">
        <MobileToolButton icon={<Menu size={17} />} label="Contents" onClick={() => setMobilePanel("toc")} />
        <MobileToolButton icon={<MessageSquare size={17} />} label="Ask document" onClick={() => setMobilePanel("chat")} />
        <MobileToolButton icon={<Search size={17} />} label="Search" onClick={() => setMobilePanel("search")} />
        <MobileToolButton icon={<Tags size={17} />} label="Technical terms" onClick={() => setMobilePanel("keywords")} />
        <MobileToolButton icon={<StickyNote size={17} />} label="Annotations" onClick={() => setMobilePanel("annotations")} />
        <MobileToolButton icon={<Settings2 size={17} />} label="Settings" onClick={() => setMobilePanel("settings")} />
      </div>

      <div className={`mt-5 grid items-start gap-7 ${gridClass}`}>
        {!isFocusMode ? <aside className="sticky top-4 hidden max-h-[calc(100vh-3rem)] overflow-y-auto border-r border-[var(--reader-border)] pr-5 lg:block pl-4"><h2 className="mb-4 text-xs font-semibold uppercase text-[var(--reader-muted)]">Contents</h2><TableOfContents items={toc} onNavigate={(item) => void navigate(item.block_id)} /></aside> : null}

        <main className="min-w-0 h-[calc(100vh-8rem)]">
          {readingMode === "pdf" ? (
            <div className="h-full w-full border border-[var(--reader-border)] bg-white rounded-md overflow-hidden shadow-sm">
              <iframe
                src={pdfLink}
                className="w-full h-full border-none"
                title="Original PDF"
              />
            </div>
          ) : readingMode === "scroll" ? (
            scrollModeContent
          ) : (
            <BookReader
              animationEnabled={immersivePrefs.pageTurnEnabled}
              blocks={visibleBlocks}
              bookmarks={bookmarkedBlocks}
              fontFamily={fontFamily}
              fontSize={preferences.font_size}
              highlightQuery={highlightQuery}
              highlightedBlock={highlightedBlock}
              highlights={highlightsByBlock}
              initialPage={Math.max(0, activePage - 1)}
              keywords={keywordsByBlock}
              keywordsEnabled={keywordPreferences.enabled}
              lineHeight={preferences.line_height}
              onBookmark={(item) => void toggleBookmark(item)}
              onKeywordSelect={(occurrence) => void selectKeyword(occurrence)}
              onPageChange={handleBookPageChange}
              onPageTurnSound={() => pageTurnSound.current?.play()}
              onSelection={setSelection}
              pageColor={room.pageColor}
              pageTextureOpacity={room.pageTextureOpacity}
              readingWidth={preferences.reading_width}
              reducedMotion={reducedMotion}
            />
          )}
        </main>

        {!isFocusMode ? <aside className="sticky top-4 hidden max-h-[calc(100vh-3rem)] overflow-y-auto lg:block pr-4"><div className="border-b border-[var(--reader-border)] pb-6">{chatPanel}</div><div className="border-b border-[var(--reader-border)] py-6"><h2 className="mb-4 text-xs font-semibold uppercase text-[var(--reader-muted)]">Search</h2>{searchPanel}</div><div className="border-b border-[var(--reader-border)] py-6">{keywordPanel}</div><div className="pt-6">{annotationPanel}</div><div className="pt-6 pb-8"><h2 className="mb-4 text-xs font-semibold uppercase text-[var(--reader-muted)]">Typography</h2><ReaderSettings onChange={changePreferences} preferences={preferences} /></div></aside> : null}
      </div>
      {selection ? <SelectionToolbar onCancel={() => setSelection(null)} onCreate={(color) => void addHighlight(color)} selection={selection} /> : null}
      {mobilePanel ? <MobilePanelDialog onClose={() => setMobilePanel(null)} title={mobilePanel === "toc" ? "Contents" : mobilePanel === "chat" ? "Ask document" : mobilePanel === "search" ? "Search document" : mobilePanel === "keywords" ? "Technical terms" : mobilePanel === "annotations" ? "Annotations" : "Reading settings"}>{mobilePanel === "toc" ? <TableOfContents items={toc} onNavigate={(item) => void navigate(item.block_id)} /> : mobilePanel === "chat" ? chatPanel : mobilePanel === "search" ? searchPanel : mobilePanel === "keywords" ? keywordPanel : mobilePanel === "annotations" ? annotationPanel : <ReaderSettings onChange={changePreferences} preferences={preferences} />}</MobilePanelDialog> : null}
    </div>
  );
}

function MobileToolButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button aria-label={label} className="grid size-10 place-items-center border border-[var(--reader-border)] bg-[var(--reader-surface)]" onClick={onClick} title={label} type="button">{icon}</button>;
}

function MobilePanelDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div aria-label="Reader tools" aria-modal="true" className="fixed inset-0 z-40 bg-black/40 lg:hidden" role="dialog"><div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto bg-[var(--reader-surface)] p-5 text-[var(--reader-foreground)]"><div className="mb-5 flex items-center justify-between border-b border-[var(--reader-border)] pb-4"><h2 className="font-semibold">{title}</h2><button aria-label="Close reader tools" className="grid size-9 place-items-center" onClick={onClose} title="Close" type="button"><X size={19} /></button></div>{children}</div></div>;
}

function ReaderState({ title, pdfLink, tone = "notice", children }: { title: string; pdfLink: string; tone?: "notice" | "danger"; children: ReactNode }) {
  const colors = tone === "danger" ? "border-[var(--danger)] bg-[var(--danger-soft)]" : "border-[var(--notice)] bg-[var(--notice-soft)]";
  return <div className="w-full"><Link className="text-sm font-semibold text-[var(--accent-strong)]" href="/library">Back to Library</Link><h1 className="mt-4 text-3xl font-semibold">{title}</h1><section className={`mt-8 border-l-4 p-6 ${colors}`} role="status"><p className="leading-7">{children}</p><a className="mt-5 inline-flex border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold" href={pdfLink} rel="noreferrer" target="_blank">View original PDF</a></section></div>;
}

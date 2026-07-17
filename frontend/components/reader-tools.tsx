"use client";

import {
  Bookmark as BookmarkIcon,
  Check,
  Minus,
  Moon,
  Plus,
  Save,
  Sun,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import {
  Bookmark,
  ContentBlock,
  Highlight,
  HighlightColor,
  ReadingPreferencesInput,
} from "@/lib/documents-api";

import { BlockSelection } from "./reader-block";

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  "yellow",
  "green",
  "blue",
  "pink",
  "purple",
];

const SWATCHES: Record<HighlightColor, string> = {
  yellow: "#ffd95a",
  green: "#7fd89b",
  blue: "#78bff5",
  pink: "#f59ac0",
  purple: "#b896ec",
};

export function ReaderSettings({
  preferences,
  onChange,
}: {
  preferences: ReadingPreferencesInput;
  onChange: (preferences: ReadingPreferencesInput) => void;
}) {
  return (
    <div aria-label="Reading settings" className="flex flex-wrap items-center gap-2" role="toolbar">
      <div className="flex border border-[var(--reader-border)]">
        {(["light", "sepia", "dark"] as const).map((theme) => (
          <button
            aria-label={`${theme} theme`}
            aria-pressed={preferences.theme === theme}
            className="grid size-9 place-items-center border-r border-[var(--reader-border)] last:border-0 aria-pressed:bg-[var(--reader-surface-muted)]"
            key={theme}
            onClick={() => onChange({ ...preferences, theme })}
            title={`${theme[0].toUpperCase()}${theme.slice(1)} theme`}
            type="button"
          >
            {theme === "dark" ? <Moon size={16} /> : theme === "light" ? <Sun size={16} /> : <span className="size-4 bg-[#d5c39a]" />}
          </button>
        ))}
      </div>
      <button
        aria-label="Decrease font size"
        className="grid size-9 place-items-center border border-[var(--reader-border)]"
        disabled={preferences.font_size <= 14}
        onClick={() => onChange({ ...preferences, font_size: preferences.font_size - 1 })}
        title="Decrease font size"
        type="button"
      >
        <Minus size={16} />
      </button>
      <span className="w-8 text-center text-xs font-semibold">{preferences.font_size}</span>
      <button
        aria-label="Increase font size"
        className="grid size-9 place-items-center border border-[var(--reader-border)]"
        disabled={preferences.font_size >= 28}
        onClick={() => onChange({ ...preferences, font_size: preferences.font_size + 1 })}
        title="Increase font size"
        type="button"
      >
        <Plus size={16} />
      </button>
      <label className="flex items-center gap-2 text-xs font-semibold">
        Spacing
        <input
          aria-label="Line height"
          className="w-20 accent-[var(--reader-accent)]"
          max="2.2"
          min="1.3"
          onChange={(event) => onChange({ ...preferences, line_height: Number(event.target.value) })}
          step="0.1"
          type="range"
          value={preferences.line_height}
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-semibold">
        Width
        <input
          aria-label="Reading width"
          className="w-20 accent-[var(--reader-accent)]"
          max="1000"
          min="520"
          onChange={(event) => onChange({ ...preferences, reading_width: Number(event.target.value) })}
          step="20"
          type="range"
          value={preferences.reading_width}
        />
      </label>
    </div>
  );
}

export function SelectionToolbar({
  selection,
  onCreate,
  onCancel,
}: {
  selection: BlockSelection;
  onCreate: (color: HighlightColor) => void;
  onCancel: () => void;
}) {
  const [color, setColor] = useState<HighlightColor>("yellow");
  return (
    <div className="fixed inset-x-3 bottom-5 z-50 mx-auto flex max-w-md items-center gap-3 border border-[var(--reader-border)] bg-[var(--reader-surface)] p-3 shadow-xl" role="dialog" aria-label="Create highlight">
      <p className="min-w-0 flex-1 truncate text-sm">{selection.selectedText}</p>
      <div className="flex gap-1">
        {HIGHLIGHT_COLORS.map((item) => (
          <button
            aria-label={`${item} highlight`}
            aria-pressed={color === item}
            className="grid size-7 place-items-center border border-transparent aria-pressed:border-[var(--reader-foreground)]"
            key={item}
            onClick={() => setColor(item)}
            title={`${item} highlight`}
            type="button"
          >
            <span className="size-4" style={{ backgroundColor: SWATCHES[item] }} />
          </button>
        ))}
      </div>
      <button aria-label="Save highlight" className="grid size-8 place-items-center bg-[var(--reader-accent)] text-white" onClick={() => onCreate(color)} title="Save highlight" type="button"><Check size={16} /></button>
      <button className="text-xs font-semibold" onClick={onCancel} type="button">Cancel</button>
    </div>
  );
}

type AnnotationPanelProps = {
  bookmarks: Bookmark[];
  highlights: Highlight[];
  blocksById: Map<string, ContentBlock>;
  onNavigate: (blockId: string) => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
  onDeleteHighlight: (highlight: Highlight) => void;
  onSaveNote: (highlight: Highlight, content: string) => Promise<void>;
  onDeleteNote: (highlight: Highlight) => Promise<void>;
};

function HighlightAnnotation({
  highlight,
  onNavigate,
  onDelete,
  onSaveNote,
  onDeleteNote,
}: {
  highlight: Highlight;
  onNavigate: () => void;
  onDelete: () => void;
  onSaveNote: (content: string) => Promise<void>;
  onDeleteNote: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(highlight.note?.content ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  async function save() {
    if (!draft.trim()) return;
    setSaveState("saving");
    try {
      await onSaveNote(draft.trim());
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    }
  }

  return (
    <li className="border-b border-[var(--reader-border)] py-4 last:border-0">
      <div className="flex items-start gap-2">
        <button className="min-w-0 flex-1 text-left text-sm leading-5" onClick={onNavigate} type="button">
          <span className="mr-2 inline-block size-2" style={{ backgroundColor: SWATCHES[highlight.color] }} />
          {highlight.selected_text}
        </button>
        <button aria-label="Delete highlight" className="grid size-7 place-items-center text-[var(--reader-muted)] hover:text-[var(--danger)]" onClick={onDelete} title="Delete highlight" type="button"><Trash2 size={15} /></button>
      </div>
      <textarea
        aria-label={`Note for ${highlight.selected_text}`}
        className="mt-3 min-h-20 w-full resize-y border border-[var(--reader-border)] bg-transparent p-2 text-sm"
        onChange={(event) => { setDraft(event.target.value); setSaveState("idle"); }}
        placeholder="Add a note"
        value={draft}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className={`text-xs ${saveState === "failed" ? "text-[var(--danger)]" : "text-[var(--reader-muted)]"}`} role="status">
          {saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : saveState === "failed" ? "Failed" : ""}
        </span>
        <div className="flex gap-1">
          {highlight.note ? <button aria-label="Delete note" className="grid size-8 place-items-center" onClick={() => void onDeleteNote()} title="Delete note" type="button"><Trash2 size={15} /></button> : null}
          <button aria-label="Save note" className="grid size-8 place-items-center bg-[var(--reader-accent)] text-white disabled:opacity-40" disabled={!draft.trim()} onClick={() => void save()} title="Save note" type="button"><Save size={15} /></button>
        </div>
      </div>
    </li>
  );
}

export function AnnotationPanel({
  bookmarks,
  highlights,
  blocksById,
  onNavigate,
  onDeleteBookmark,
  onDeleteHighlight,
  onSaveNote,
  onDeleteNote,
}: AnnotationPanelProps) {
  return (
    <div className="space-y-7">
      <section>
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--reader-muted)]"><BookmarkIcon size={15} /> Bookmarks</h2>
        {bookmarks.length === 0 ? <p className="mt-3 text-sm text-[var(--reader-muted)]">No bookmarks yet.</p> : (
          <ol className="mt-2">
            {bookmarks.map((bookmark) => (
              <li className="flex items-center border-b border-[var(--reader-border)] py-2" key={bookmark.id}>
                <button className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => onNavigate(bookmark.content_block_id)} type="button">{bookmark.title}</button>
                <button aria-label={`Delete bookmark ${bookmark.title}`} className="grid size-7 place-items-center text-[var(--reader-muted)]" onClick={() => onDeleteBookmark(bookmark)} title="Delete bookmark" type="button"><Trash2 size={14} /></button>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section>
        <h2 className="text-xs font-semibold uppercase text-[var(--reader-muted)]">Highlights & notes</h2>
        {highlights.length === 0 ? <p className="mt-3 text-sm text-[var(--reader-muted)]">Select text in one block to start.</p> : (
          <ol className="mt-2">
            {highlights.map((highlight) => (
              <HighlightAnnotation
                highlight={highlight}
                key={`${highlight.id}-${highlight.note?.updated_at ?? "no-note"}`}
                onDelete={() => onDeleteHighlight(highlight)}
                onDeleteNote={() => onDeleteNote(highlight)}
                onNavigate={() => {
                  if (blocksById.has(highlight.content_block_id)) onNavigate(highlight.content_block_id);
                }}
                onSaveNote={(content) => onSaveNote(highlight, content)}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

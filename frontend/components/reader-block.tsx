"use client";

import hljs from "highlight.js/lib/common";
import katex from "katex";
import { Bookmark, BookmarkCheck, Check, Copy } from "lucide-react";
import { ReactNode, useMemo, useRef, useState } from "react";

import {
  ContentBlock,
  Highlight,
  KeywordOccurrence,
  protectedBlockImageUrl,
} from "@/lib/documents-api";

export type BlockSelection = {
  block: ContentBlock;
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

type ReaderBlockProps = {
  block: ContentBlock;
  highlights: Highlight[];
  keywords: KeywordOccurrence[];
  highlighted: boolean;
  query: string;
  bookmarked: boolean;
  onBookmark: (block: ContentBlock) => void;
  onSelection: (selection: BlockSelection) => void;
  onKeywordSelect: (occurrence: KeywordOccurrence) => void;
};

const HIGHLIGHT_CLASSES: Record<Highlight["color"], string> = {
  yellow: "bg-[#ffe58a]",
  green: "bg-[#bcebc9]",
  blue: "bg-[#b9ddff]",
  pink: "bg-[#ffc9df]",
  purple: "bg-[#dcc7ff]",
};

function SearchText({ text, query }: { text: string; query: string }) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return text;
  const index = text.toLocaleLowerCase().indexOf(normalizedQuery.toLocaleLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-[var(--search-highlight)] px-0.5">
        {text.slice(index, index + normalizedQuery.length)}
      </mark>
      {text.slice(index + normalizedQuery.length)}
    </>
  );
}

function AnnotatedText({
  text,
  highlights,
  keywords,
  query,
  onKeywordActivate,
}: {
  text: string;
  highlights: Highlight[];
  keywords: KeywordOccurrence[];
  query: string;
  onKeywordActivate: (occurrence: KeywordOccurrence, target: HTMLElement) => void;
}) {
  const segments: ReactNode[] = [];
  const active = highlights
    .filter(
      (item) =>
        item.status === "ACTIVE" &&
        item.start_offset >= 0 &&
        item.end_offset <= text.length &&
        item.start_offset < item.end_offset,
    )
    .sort((left, right) => left.start_offset - right.start_offset);
  const activeKeywords = keywords.filter(
    (item) =>
      !item.is_suppressed &&
      item.start_offset >= 0 &&
      item.end_offset <= text.length &&
      item.start_offset < item.end_offset,
  );
  const boundaries = new Set([0, text.length]);
  active.forEach((item) => {
    boundaries.add(item.start_offset);
    boundaries.add(item.end_offset);
  });
  activeKeywords.forEach((item) => {
    boundaries.add(item.start_offset);
    boundaries.add(item.end_offset);
  });
  const offsets = [...boundaries].sort((left, right) => left - right);

  for (let index = 0; index < offsets.length - 1; index += 1) {
    const start = offsets[index];
    const end = offsets[index + 1];
    if (start === end) continue;
    const highlight = active.find(
      (item) => item.start_offset <= start && item.end_offset >= end,
    );
    const keyword = activeKeywords.find(
      (item) => item.start_offset <= start && item.end_offset >= end,
    );
    let content: ReactNode = (
      <SearchText key={`search-${start}`} query={query} text={text.slice(start, end)} />
    );
    if (keyword) {
      content = (
        <button
          aria-label={`Technical term: ${keyword.keyword.canonical_name}`}
          className="border-b border-dotted border-[var(--reader-accent)] bg-[var(--notice-soft)]/60 text-inherit outline-offset-2"
          data-keyword-id={keyword.keyword.id}
          key={`keyword-${keyword.id}-${start}`}
          onClick={(event) => onKeywordActivate(keyword, event.currentTarget)}
          onFocus={(event) => onKeywordActivate(keyword, event.currentTarget)}
          type="button"
        >
          {content}
        </button>
      );
    }
    if (highlight) {
      content = (
        <mark
          className={`${HIGHLIGHT_CLASSES[highlight.color]} rounded-[2px] px-0.5 text-inherit`}
          data-highlight-id={highlight.id}
          key={`highlight-${highlight.id}-${start}`}
          title={highlight.note?.content ?? "Saved highlight"}
        >
          {content}
        </mark>
      );
    }
    segments.push(content);
  }
  return segments;
}

function CodeBlock({ block }: { block: ContentBlock }) {
  const [copied, setCopied] = useState(false);
  const language = typeof block.metadata.language === "string" ? block.metadata.language : "";
  const highlightedCode = useMemo(() => {
    try {
      return language && hljs.getLanguage(language)
        ? hljs.highlight(block.text, { language }).value
        : hljs.highlightAuto(block.text).value;
    } catch {
      return block.text;
    }
  }, [block.text, language]);

  async function copyCode() {
    await navigator.clipboard.writeText(block.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="my-6 overflow-hidden border border-[var(--reader-border)] bg-[var(--code)]">
      <div className="flex h-10 items-center justify-between border-b border-[var(--reader-border)] px-3">
        <span className="text-xs font-semibold text-[var(--reader-muted)]">{language || "Code"}</span>
        <button
          aria-label="Copy code"
          className="grid size-8 place-items-center hover:bg-[var(--reader-surface-muted)]"
          onClick={() => void copyCode()}
          title="Copy code"
          type="button"
        >
          {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-6">
        <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
      </pre>
    </div>
  );
}

function TableBlock({ block }: { block: ContentBlock }) {
  const rows = Array.isArray(block.metadata.rows) ? block.metadata.rows : null;
  if (!rows || rows.some((row) => !Array.isArray(row))) {
    return <pre className="my-6 overflow-x-auto border border-[var(--reader-border)] p-4 text-sm">{block.text}</pre>;
  }
  return (
    <div className="my-8 overflow-x-auto">
      <table className="w-full text-left text-[0.85em] leading-snug">
        <thead>
          <tr className="border-b-2 border-[var(--reader-foreground)]/80">
            {(rows[0] as unknown[]).map((cell, cellIndex) => (
              <th className="py-2.5 px-3 font-bold text-[var(--reader-foreground)]" key={cellIndex}>
                {String(cell ?? "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, rowIndex) => (
            <tr className="border-b border-[var(--reader-border)]/50 last:border-b-2 last:border-[var(--reader-foreground)]/80" key={rowIndex}>
              {(row as unknown[]).map((cell, cellIndex) => (
                <td className="py-2 px-3 text-[var(--reader-muted)] align-top" key={cellIndex}>
                  {String(cell ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormulaBlock({ block }: { block: ContentBlock }) {
  const formula = typeof block.metadata.formula === "string" ? block.metadata.formula : block.text;
  let markup: string | null = null;
  try {
    markup = katex.renderToString(formula, {
      displayMode: true,
      output: "html",
      strict: "error",
      throwOnError: true,
      trust: false,
    });
  } catch {
    markup = null;
  }
  if (markup === null) {
    return <pre className="my-6 overflow-x-auto border-l-4 border-[var(--reader-border)] p-4">{formula}</pre>;
  }
  return (
    <div
      aria-label={`Formula: ${formula}`}
      className="my-8 overflow-x-auto py-4 text-center text-[1.1em]"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

function ImageBlock({ block }: { block: ContentBlock }) {
  return (
    <figure className="my-8 flex flex-col items-center">
      {/* The URL is an ownership-checked API endpoint, never a public object URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="relative rounded-sm bg-white p-2 shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-[var(--reader-border)]/50">
        <img
          alt={block.text || "Document figure"}
          className="max-h-[50vh] max-w-full object-contain mix-blend-multiply"
          loading="lazy"
          src={protectedBlockImageUrl(block.id)}
        />
      </div>
      {block.text ? (
        <figcaption className="mt-4 text-center text-[0.8em] font-medium italic text-[var(--reader-muted)] px-6">
          Figure: {block.text}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function ReaderBlock({
  block,
  highlights,
  keywords,
  highlighted,
  query,
  bookmarked,
  onBookmark,
  onSelection,
  onKeywordSelect,
}: ReaderBlockProps) {
  const textRoot = useRef<HTMLElement | null>(null);
  const [tooltip, setTooltip] = useState<{
    occurrence: KeywordOccurrence;
    left: number;
    top: number;
  } | null>(null);

  function activateKeyword(occurrence: KeywordOccurrence, target: HTMLElement) {
    const bounds = target.getBoundingClientRect();
    setTooltip({
      occurrence,
      left: Math.min(bounds.left, window.innerWidth - 300),
      top: bounds.bottom + 8,
    });
    onKeywordSelect(occurrence);
  }

  const content = (
    <AnnotatedText
      highlights={highlights}
      keywords={keywords}
      onKeywordActivate={activateKeyword}
      query={query}
      text={block.text}
    />
  );
  const emphasis = `${block.is_bold ? "font-semibold" : ""} ${block.is_italic ? "italic" : ""}`;
  const commonClass = `outline-none transition-colors ${highlighted ? "reader-block-flash" : ""}`;

  function captureSelection() {
    const root = textRoot.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const before = range.cloneRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    const startOffset = before.toString().length;
    const endOffset = startOffset + range.toString().length;
    if (block.text.slice(startOffset, endOffset) !== range.toString()) return;
    onSelection({ block, startOffset, endOffset, selectedText: range.toString() });
  }

  function setTextRoot(node: HTMLElement | null) {
    textRoot.current = node;
  }

  let blockContent: ReactNode;
  switch (block.block_type) {
    case "HEADING_1":
      blockContent = <h1 className={`${commonClass} mt-6 mb-3 text-3xl font-semibold first:mt-0`} onMouseUp={captureSelection} ref={setTextRoot} tabIndex={-1}>{content}</h1>;
      break;
    case "HEADING_2":
      blockContent = <h2 className={`${commonClass} mt-5 mb-2 text-2xl font-semibold`} onMouseUp={captureSelection} ref={setTextRoot} tabIndex={-1}>{content}</h2>;
      break;
    case "HEADING_3":
      blockContent = <h3 className={`${commonClass} mt-4 mb-2 text-xl font-semibold`} onMouseUp={captureSelection} ref={setTextRoot} tabIndex={-1}>{content}</h3>;
      break;
    case "LIST_ITEM":
      blockContent = <ul className={`${commonClass} mb-1 list-disc pl-7`}><li className={`pl-1 ${emphasis}`} onMouseUp={captureSelection} ref={setTextRoot}>{content}</li></ul>;
      break;
    case "CODE":
      blockContent = <CodeBlock block={block} />;
      break;
    case "QUOTE":
      blockContent = <blockquote className={`${commonClass} mb-3 mt-1 border-l-4 border-[var(--reader-accent)] pl-5 italic`} onMouseUp={captureSelection} ref={setTextRoot} tabIndex={-1}>{content}</blockquote>;
      break;
    case "PAGE_BREAK":
      blockContent = <div aria-label={`End of page ${block.page_number}`} className="my-6 flex items-center gap-4 text-xs text-[var(--reader-muted)]" role="separator"><span className="h-px flex-1 bg-[var(--reader-border)]" />Page {block.page_number}<span className="h-px flex-1 bg-[var(--reader-border)]" /></div>;
      break;
    case "TABLE":
      blockContent = <TableBlock block={block} />;
      break;
    case "FORMULA":
      blockContent = <FormulaBlock block={block} />;
      break;
    case "IMAGE":
      blockContent = <ImageBlock block={block} />;
      break;
    default:
      blockContent = <p className={`${commonClass} mb-2 mt-0 ${emphasis}`} onMouseUp={captureSelection} ref={setTextRoot} tabIndex={-1}>{content}</p>;
  }

  return (
    <div
      className="group relative px-1 py-1"
      data-page={block.page_number}
      id={`block-${block.id}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") setTooltip(null);
      }}
    >
      {block.block_type !== "PAGE_BREAK" ? (
        <button
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark block"}
          className="absolute -right-1 top-2 grid size-8 place-items-center text-[var(--reader-muted)] opacity-0 transition-opacity hover:text-[var(--reader-accent)] focus:opacity-100 group-hover:opacity-100"
          onClick={() => onBookmark(block)}
          title={bookmarked ? "Remove bookmark" : "Bookmark block"}
          type="button"
        >
          {bookmarked ? <BookmarkCheck aria-hidden="true" size={17} /> : <Bookmark aria-hidden="true" size={17} />}
        </button>
      ) : null}
      {blockContent}
      {tooltip ? (
        <div
          className="fixed z-50 w-72 border border-[var(--reader-border)] bg-[var(--reader-surface)] p-3 text-sm leading-5 text-[var(--reader-foreground)] shadow-lg"
          role="tooltip"
          style={{ left: Math.max(8, tooltip.left), top: tooltip.top }}
        >
          <strong className="block">{tooltip.occurrence.keyword.canonical_name}</strong>
          <span className="mt-1 block text-[var(--reader-muted)]">
            {tooltip.occurrence.keyword.short_definition}
          </span>
          <span className="mt-2 block text-xs font-semibold uppercase text-[var(--reader-accent)]">
            Open in glossary
          </span>
        </div>
      ) : null}
    </div>
  );
}

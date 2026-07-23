"use client";

import { useMemo } from "react";

import { useI18n } from "@/components/i18n-provider";
import type { ContentBlock, TocItem } from "@/lib/documents-api";

function normalizeHeading(value: string): string {
  return value.trim().toLocaleLowerCase("vi");
}

function isAbstractHeading(value: string): boolean {
  const normalized = normalizeHeading(value);
  return normalized === "abstract" || normalized === "tóm tắt";
}

export function ResearchReferencePanel({
  blocks,
  onNavigate,
  toc,
}: {
  blocks: ContentBlock[];
  onNavigate: (blockId: string) => void;
  toc: TocItem[];
}) {
  const { t } = useI18n();
  const { abstract, references } = useMemo(() => {
    const abstractBlocks: ContentBlock[] = [];
    const referenceBlocks: ContentBlock[] = [];
    let collectingAbstract = false;

    for (const block of blocks) {
      const isHeading = block.block_type.startsWith("HEADING_");
      if (isHeading && isAbstractHeading(block.text)) {
        collectingAbstract = true;
        continue;
      }
      if (isHeading && collectingAbstract) collectingAbstract = false;
      if (
        block.semantic_role === "reference" ||
        block.semantic_role === "reference_heading"
      ) {
        collectingAbstract = false;
        referenceBlocks.push(block);
        continue;
      }
      if (block.semantic_role === "abstract" || collectingAbstract) {
        abstractBlocks.push(block);
      }
    }
    return { abstract: abstractBlocks, references: referenceBlocks };
  }, [blocks]);

  return (
    <div className="space-y-7">
      <section>
        <h2 className="text-xs font-semibold uppercase text-[var(--reader-muted)]">
          {t("reader", "research.abstract")}
        </h2>
        {abstract.length ? (
          <div className="mt-3 space-y-2 text-sm leading-6">
            {abstract.map((block) => (
              <button
                className="block w-full text-left hover:text-[var(--reader-accent)]"
                key={block.id}
                onClick={() => onNavigate(block.id)}
                type="button"
              >
                {block.text}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--reader-muted)]">
            {t("reader", "research.noAbstract")}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase text-[var(--reader-muted)]">
          {t("reader", "research.sections")}
        </h2>
        <ol className="mt-2 space-y-1">
          {toc.map((item) => (
            <li key={`${item.block_id}-${item.sequence_number}`}>
              <button
                className="w-full py-1 text-left text-sm hover:text-[var(--reader-accent)]"
                onClick={() => onNavigate(item.block_id)}
                type="button"
              >
                {item.title}
                <span className="ml-2 text-xs text-[var(--reader-muted)]">
                  {item.page_number}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase text-[var(--reader-muted)]">
          {t("reader", "research.references")}
        </h2>
        {references.length ? (
          <ol className="mt-2 space-y-2">
            {references.map((block) => (
              <li key={block.id}>
                <button
                  className="w-full text-left text-sm leading-5 hover:text-[var(--reader-accent)]"
                  onClick={() => onNavigate(block.id)}
                  type="button"
                >
                  {block.text}
                  <span className="ml-2 text-xs text-[var(--reader-muted)]">
                    {t("reader", "sourcePage")} {block.source_page_number}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-[var(--reader-muted)]">
            {t("reader", "research.noReferences")}
          </p>
        )}
      </section>
    </div>
  );
}

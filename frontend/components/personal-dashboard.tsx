"use client";

import { BookMarked, Clock3, FileCheck2, FileClock, Flame, Library, MoreHorizontal, NotebookPen, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useI18n } from "./i18n-provider";
import {
  DashboardData,
  DashboardDocument,
  fetchDashboard,
} from "@/lib/dashboard-api";
import { documentCoverUrl } from "@/lib/documents-api";
import { setReadingAnalyticsEnabled } from "@/lib/personalization-api";

const PROCESSING_STAGES = new Set([
  "QUEUED",
  "SAFETY_CHECK",
  "EXTRACTING",
  "STRUCTURING",
  "READABLE",
  "TOC",
  "INDEXING",
]);

function Cover({ document }: { document: DashboardDocument }) {
  const hue = [...document.id].reduce((total, char) => total + char.charCodeAt(0), 0) % 360;
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[3/4] overflow-hidden rounded-r-lg rounded-l-sm p-4 text-white shadow-lg"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 55% 28%), hsl(${(hue + 42) % 360} 62% 48%))`,
      }}
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
      <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/35 to-white/10" />
      <p className="line-clamp-5 pt-4 text-sm font-bold leading-snug">{document.title}</p>
      <p className="absolute bottom-4 left-4 text-[10px] font-semibold uppercase tracking-widest opacity-80">
        {document.document_type}
      </p>
    </div>
  );
}

function DocumentCard({ document }: { document: DashboardDocument }) {
  const { formatDate, t } = useI18n();
  const isProcessing =
    PROCESSING_STAGES.has(document.processing_status ?? "") ||
    PROCESSING_STAGES.has(document.status);
  const displayedProgress = isProcessing
    ? document.processing_progress
    : document.progress_percent;
  const displayedStatus = isProcessing
    ? document.processing_status ?? document.status
    : document.status;
  return (
    <article className="grid grid-cols-[92px_1fr] gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <Link href={`/documents/${document.id}/read`}><Cover document={document} /></Link>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <Link className="line-clamp-2 font-semibold hover:text-[var(--accent)]" href={`/documents/${document.id}/read`}>
            {document.title}
          </Link>
          <Link aria-label={t("library", "dashboard.actions")} className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-[var(--surface-muted)]" href={`/documents/${document.id}`}>
            <MoreHorizontal size={18} />
          </Link>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">{document.document_type} · {formatDate(document.created_at, { dateStyle: "medium" })}</p>
        <p className="mt-2 truncate text-xs text-[var(--muted)]">{document.last_chapter ?? t("library", "dashboard.noChapter")}</p>
        <div
          aria-label={`${Math.round(displayedProgress)}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(displayedProgress)}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"
          role="progressbar"
        >
          <div
            className="h-full bg-[var(--accent)]"
            style={{ width: `${displayedProgress}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between gap-2 text-[11px] text-[var(--muted)]">
          <span>{Math.round(displayedProgress)}%</span>
          <span>
            {document.last_read_at && !isProcessing
              ? formatDate(document.last_read_at, {
                  dateStyle: "short",
                  timeStyle: "short",
                })
              : t("library", `statuses.${displayedStatus}`)}
          </span>
        </div>
      </div>
    </article>
  );
}

function DocumentSection({ title, items }: { title: string; items: DashboardDocument[] }) {
  const { t } = useI18n();
  return (
    <section>
      <h2 className="text-xl font-semibold">{title}</h2>
      {items.length ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {items.map((document) => <DocumentCard document={document} key={document.id} />)}
        </div>
      ) : <p className="mt-3 text-sm text-[var(--muted)]">{t("library", "dashboard.emptySection")}</p>}
    </section>
  );
}

export function PersonalDashboard() {
  const { formatNumber, t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyticsUpdating, setAnalyticsUpdating] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  useEffect(() => {
    let active = true;
    fetchDashboard().then((value) => active && setData(value)).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : t("library", "dashboard.loadError")));
    return () => { active = false; };
  }, [t]);
  if (error) return <p className="border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-5" role="alert">{error}</p>;
  if (!data) return <div aria-label={t("library", "dashboard.loading")} className="h-72 animate-pulse rounded-xl bg-[var(--surface-muted)]" />;
  const readingMinutes = Math.floor(data.stats.reading_time_seconds / 60);
  const readingTime = readingMinutes >= 60
    ? t("personalization", "analytics.hoursMinutes", {
        hours: Math.floor(readingMinutes / 60),
        minutes: readingMinutes % 60,
      })
    : t("personalization", "analytics.minutes", {
        minutes: readingMinutes,
      });

  async function updateAnalytics(enabled: boolean) {
    if (analyticsUpdating) return;
    setAnalyticsUpdating(true);
    setAnalyticsError("");
    try {
      const analytics = await setReadingAnalyticsEnabled(enabled);
      setData((current) =>
        current
          ? {
              ...current,
              stats: {
                ...current.stats,
                analytics_enabled: analytics.enabled,
                reading_streak_days: analytics.reading_streak_days,
                reading_time_seconds: analytics.total_reading_seconds,
                source_pages_reached: analytics.source_pages_reached,
              },
            }
          : current,
      );
    } catch {
      setAnalyticsError(t("personalization", "analytics.error"));
    } finally {
      setAnalyticsUpdating(false);
    }
  }

  const stats = [
    [Library, data.stats.total_documents, t("library", "dashboard.stats.documents")],
    [FileClock, data.stats.in_progress_documents, t("library", "dashboard.stats.reading")],
    [FileCheck2, data.stats.completed_documents, t("library", "dashboard.stats.completed")],
    [BookMarked, data.stats.bookmark_count, t("library", "dashboard.stats.bookmarks")],
    [NotebookPen, data.stats.note_count, t("library", "dashboard.stats.notes")],
  ] as const;
  const analyticsStats = [
    [Clock3, readingTime, t("personalization", "analytics.time")],
    [
      Flame,
      t("personalization", "analytics.days", {
        count: formatNumber(data.stats.reading_streak_days),
      }),
      t("personalization", "analytics.streak"),
    ],
    [
      BookMarked,
      formatNumber(data.stats.source_pages_reached),
      t("personalization", "analytics.pages"),
    ],
    [
      FileCheck2,
      formatNumber(data.stats.completed_documents),
      t("personalization", "analytics.completed"),
    ],
  ] as const;
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold uppercase text-[var(--accent)]">{t("library", "dashboard.eyebrow")}</p><h1 className="mt-2 text-3xl font-semibold">{t("library", "dashboard.title")}</h1></div>
        <Link className="rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white" href="/upload">{t("library", "uploadAction")}</Link>
      </div>
      <section aria-label={t("library", "dashboard.stats.title")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([Icon, value, label]) => <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" key={label}><Icon className="text-[var(--accent)]" size={19} /><p className="mt-3 text-2xl font-semibold">{value}</p><p className="text-xs text-[var(--muted)]">{label}</p></div>)}
      </section>
      <section
        aria-labelledby="reading-analytics-title"
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[var(--accent)]">
              <ShieldCheck aria-hidden="true" size={20} />
              <h2 className="text-xl font-semibold" id="reading-analytics-title">
                {t("personalization", "analytics.title")}
              </h2>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {t("personalization", "analytics.description")}
            </p>
          </div>
          <button
            className={`min-h-11 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
              data.stats.analytics_enabled
                ? "border border-[var(--border)] text-[var(--muted)]"
                : "bg-[var(--accent)] text-white"
            }`}
            disabled={analyticsUpdating}
            onClick={() => void updateAnalytics(!data.stats.analytics_enabled)}
            type="button"
          >
            {analyticsUpdating
              ? t("personalization", "analytics.updating")
              : data.stats.analytics_enabled
                ? t("personalization", "analytics.disable")
                : t("personalization", "analytics.enable")}
          </button>
        </div>
        {analyticsError ? (
          <p className="mt-4 text-sm text-[var(--danger)]" role="alert">
            {analyticsError}
          </p>
        ) : null}
        {data.stats.analytics_enabled ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {analyticsStats.map(([Icon, value, label]) => (
                <div
                  className="rounded-xl bg-[var(--surface-muted)] p-4"
                  key={String(label)}
                >
                  <Icon aria-hidden="true" size={18} />
                  <p className="mt-3 text-xl font-semibold">{value}</p>
                  <p className="text-xs text-[var(--muted)]">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-[var(--muted)]">
              {t("personalization", "analytics.privacy")}
            </p>
          </>
        ) : (
          <p className="mt-5 rounded-xl bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">
            {t("personalization", "analytics.disabled")}
          </p>
        )}
      </section>
      <DocumentSection items={data.continue_reading} title={t("library", "continueReading")} />
      <DocumentSection items={data.recent_documents} title={t("library", "recent")} />
      <DocumentSection items={data.processing_documents} title={t("library", "processing")} />
      <DocumentSection items={data.completed_documents} title={t("library", "completed")} />
      <section>
        <h2 className="text-xl font-semibold">
          {t("library", "dashboard.collections")}
        </h2>
        {data.collections.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.collections.map((collection) => (
              <Link
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
                href={`/library?collection_id=${collection.id}`}
                key={collection.id}
              >
                <strong>{collection.name}</strong>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  {t("library", "dashboard.collectionDocuments", {
                    count: collection.document_count,
                  })}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">
            {t("library", "dashboard.emptyCollections")}
          </p>
        )}
      </section>
      <div className="grid gap-8 lg:grid-cols-2">
        <section><h2 className="text-xl font-semibold">{t("library", "dashboard.recentBookmarks")}</h2><div className="mt-3 divide-y divide-[var(--border)]">{data.recent_bookmarks.map((item) => <Link className="block py-3 text-sm" href={`/documents/${item.document_id}/read`} key={item.id}><strong>{item.title}</strong><span className="ml-2 text-[var(--muted)]">{item.document_title} · {t("reader", "sourcePage")} {item.page_number}</span></Link>)}</div></section>
        <section><h2 className="text-xl font-semibold">{t("library", "dashboard.recentNotes")}</h2><div className="mt-3 divide-y divide-[var(--border)]">{data.recent_notes.map((item) => <Link className="block py-3 text-sm" href={`/documents/${item.document_id}/read`} key={item.id}><strong className="line-clamp-1">{item.content}</strong><span className="text-[var(--muted)]">{item.document_title} · “{item.selected_text}”</span></Link>)}</div></section>
      </div>
    </div>
  );
}

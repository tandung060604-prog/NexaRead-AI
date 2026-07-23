"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  FileSearch,
  FileText,
  GraduationCap,
  Highlighter,
  Languages,
  LibraryBig,
  LockKeyhole,
  MessageSquareQuote,
  Microscope,
  MonitorSmartphone,
  Search,
  ShieldCheck,
  Sparkles,
  StickyNote,
  UploadCloud,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { useI18n } from "@/components/i18n-provider";

export default function HomePage() {
  const { t } = useI18n();
  const problems = [
    ["longPdf", FileText],
    ["brokenLayout", MonitorSmartphone],
    ["lostKnowledge", FileSearch],
    ["ungroundedAi", MessageSquareQuote],
  ] as const;
  const steps = [
    ["upload", UploadCloud],
    ["structure", BookOpen],
    ["learn", Sparkles],
  ] as const;
  const features = [
    ["book", BookOpen],
    ["layout", FileText],
    ["citations", MessageSquareQuote],
    ["private", LockKeyhole],
    ["notes", Highlighter],
    ["devices", MonitorSmartphone],
  ] as const;
  const audiences = [
    ["student", GraduationCap],
    ["researcher", Microscope],
    ["engineer", Wrench],
    ["professional", BriefcaseBusiness],
    ["learner", LibraryBig],
  ] as const;
  const faqKeys = ["formats", "privacy", "hallucination", "scan", "vietnamese", "original"];

  return (
    <>
      <section
        className="relative overflow-hidden border-b border-[var(--border)]"
        id="product"
      >
        <div className="public-hero-glow pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-[90rem] items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--accent-strong)]">
              <Sparkles aria-hidden="true" size={15} />
              {t("landing", "badge")}
            </div>
            <h1 className="mt-7 font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
              {t("landing", "heroTitle")}
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
              {t("landing", "heroSubtitle")}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
                href="/register"
              >
                {t("landing", "primaryCta")}
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <Link
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-6 text-sm font-semibold hover:bg-[var(--surface-muted)]"
                href="/#reader-preview"
              >
                {t("landing", "secondaryCta")}
                <BookOpen aria-hidden="true" size={17} />
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--muted)]">
              {["formats", "citations", "private"].map((key) => (
                <li className="flex items-center gap-2" key={key}>
                  <Check aria-hidden="true" className="text-[var(--accent-strong)]" size={16} />
                  {t("landing", `heroProof.${key}`)}
                </li>
              ))}
            </ul>
          </div>
          <ReaderProductPreview />
        </div>
      </section>

      <section className="mx-auto max-w-[90rem] px-4 py-20 sm:px-6 sm:py-28">
        <SectionIntro
          eyebrow={t("landing", "problem.eyebrow")}
          title={t("landing", "problem.title")}
          description={t("landing", "problem.description")}
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {problems.map(([key, Icon], index) => (
            <InfoCard
              description={t("landing", `problem.items.${key}.description`)}
              icon={Icon}
              index={`0${index + 1}`}
              key={key}
              title={t("landing", `problem.items.${key}.title`)}
            />
          ))}
        </div>
      </section>

      <section
        className="border-y border-[var(--border)] bg-[var(--surface-muted)]"
        id="how-it-works"
      >
        <div className="mx-auto max-w-[90rem] px-4 py-20 sm:px-6 sm:py-28">
          <SectionIntro
            centered
            eyebrow={t("landing", "how.eyebrow")}
            title={t("landing", "how.title")}
            description={t("landing", "how.description")}
          />
          <ol className="relative mt-12 grid gap-5 lg:grid-cols-3">
            {steps.map(([key, Icon], index) => (
              <li
                className="relative border border-[var(--border)] bg-[var(--surface)] p-7 sm:p-8"
                key={key}
              >
                <span className="text-xs font-bold tracking-[0.18em] text-[var(--accent-strong)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Icon aria-hidden="true" className="mt-6 text-[var(--accent-strong)]" size={28} />
                <h3 className="mt-5 font-serif text-2xl font-semibold">
                  {t("landing", `how.steps.${key}.title`)}
                </h3>
                <p className="mt-3 leading-7 text-[var(--muted)]">
                  {t("landing", `how.steps.${key}.description`)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-[90rem] px-4 py-20 sm:px-6 sm:py-28" id="features">
        <SectionIntro
          eyebrow={t("landing", "features.eyebrow")}
          title={t("landing", "features.title")}
          description={t("landing", "features.description")}
        />
        <div className="mt-12 grid gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([key, Icon]) => (
            <article className="bg-[var(--background)] p-7 sm:p-8" key={key}>
              <span className="grid size-11 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                <Icon aria-hidden="true" size={21} />
              </span>
              <h3 className="mt-6 text-lg font-semibold">
                {t("landing", `features.items.${key}.title`)}
              </h3>
              <p className="mt-3 leading-7 text-[var(--muted)]">
                {t("landing", `features.items.${key}.description`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="border-y border-[var(--border)] bg-[var(--surface-muted)]"
        id="audience"
      >
        <div className="mx-auto max-w-[90rem] px-4 py-20 sm:px-6 sm:py-28">
          <SectionIntro
            centered
            eyebrow={t("landing", "audience.eyebrow")}
            title={t("landing", "audience.title")}
            description={t("landing", "audience.description")}
          />
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-5">
            {audiences.map(([key, Icon]) => (
              <article
                className="flex min-h-40 flex-col items-center justify-center border border-[var(--border)] bg-[var(--surface)] p-5 text-center"
                key={key}
              >
                <Icon aria-hidden="true" className="text-[var(--accent-strong)]" size={25} />
                <h3 className="mt-4 font-semibold">
                  {t("landing", `audience.items.${key}`)}
                </h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[90rem] px-4 py-20 sm:px-6 sm:py-28" id="privacy">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <span className="grid size-14 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              <ShieldCheck aria-hidden="true" size={28} />
            </span>
            <h2 className="mt-7 max-w-2xl font-serif text-3xl font-semibold tracking-[-0.02em] sm:text-5xl">
              {t("landing", "privacy.title")}
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted)]">
              {t("landing", "privacy.description")}
            </p>
          </div>
          <ul className="grid gap-3">
            {["account", "ownership", "original", "citations"].map((key) => (
              <li
                className="flex gap-4 border border-[var(--border)] bg-[var(--surface)] p-5"
                key={key}
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white">
                  <Check aria-hidden="true" size={15} />
                </span>
                <div>
                  <h3 className="font-semibold">
                    {t("landing", `privacy.items.${key}.title`)}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                    {t("landing", `privacy.items.${key}.description`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="border-y border-[var(--border)] bg-[var(--surface-muted)]"
        id="faq"
      >
        <div className="mx-auto grid max-w-[90rem] gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[0.7fr_1.3fr]">
          <SectionIntro
            eyebrow={t("landing", "faq.eyebrow")}
            title={t("landing", "faq.title")}
            description={t("landing", "faq.description")}
          />
          <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {faqKeys.map((key) => (
              <details className="group py-1" key={key}>
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold">
                  {t("landing", `faq.items.${key}.question`)}
                  <ChevronDown
                    aria-hidden="true"
                    className="shrink-0 transition-transform group-open:rotate-180"
                    size={19}
                  />
                </summary>
                <p className="max-w-3xl pb-6 pr-10 leading-7 text-[var(--muted)]">
                  {t("landing", `faq.items.${key}.answer`)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[90rem] px-4 py-20 sm:px-6 sm:py-28">
        <div className="relative overflow-hidden rounded-2xl bg-[var(--accent)] px-6 py-14 text-white sm:px-12 sm:py-20">
          <div className="public-cta-pattern pointer-events-none absolute inset-0 opacity-25" />
          <div className="relative max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/70">
              NexaRead AI
            </p>
            <h2 className="mt-4 font-serif text-3xl font-semibold tracking-[-0.025em] sm:text-5xl">
              {t("landing", "finalCta.title")}
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/75">
              {t("landing", "finalCta.description")}
            </p>
            <Link
              className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-lg bg-white px-6 text-sm font-semibold text-[#173e34] transition-transform hover:-translate-y-0.5"
              href="/register"
            >
              {t("common", "nav.register")}
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-4 px-4 py-8 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="font-semibold text-[var(--foreground)]">NexaRead AI</p>
          <p>{t("landing", "footer")}</p>
          <div className="flex gap-5">
            <Link href="/#privacy">{t("landing", "nav.privacy")}</Link>
            <Link href="/#faq">{t("landing", "nav.faq")}</Link>
          </div>
        </div>
      </footer>
    </>
  );
}

function ReaderProductPreview() {
  const { t } = useI18n();
  return (
    <section
      aria-label={t("landing", "preview.label")}
      className="relative mx-auto w-full max-w-3xl"
      id="reader-preview"
    >
      <div className="absolute -inset-4 rounded-[2rem] border border-[var(--border)] opacity-50" />
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-[0_30px_90px_rgba(7,24,19,0.22)]">
        <div className="flex min-h-12 items-center justify-between border-b border-[var(--border)] px-4">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#e2725b]" />
            <span className="size-2 rounded-full bg-[#d6a84b]" />
            <span className="size-2 rounded-full bg-[#5ba37b]" />
          </div>
          <span className="text-xs font-semibold text-[var(--muted)]">
            {t("landing", "preview.readerMode")}
          </span>
          <span className="text-xs tabular-nums text-[var(--muted)]">38%</span>
        </div>
        <div className="grid min-h-[31rem] grid-cols-[1fr] sm:grid-cols-[9.5rem_1fr]">
          <aside className="hidden border-r border-[var(--border)] bg-[var(--surface-muted)] p-4 sm:block">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
              {t("landing", "preview.contents")}
            </p>
            <ol className="mt-5 space-y-4 text-xs">
              <li className="font-semibold text-[var(--accent-strong)]">
                01 · {t("landing", "preview.introduction")}
              </li>
              <li className="text-[var(--muted)]">
                02 · {t("landing", "preview.retrieval")}
              </li>
              <li className="text-[var(--muted)]">
                03 · {t("landing", "preview.evaluation")}
              </li>
            </ol>
            <div className="mt-8 border-t border-[var(--border)] pt-4">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                {t("landing", "preview.progress")}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                <div className="h-full w-[38%] rounded-full bg-[var(--accent)]" />
              </div>
            </div>
          </aside>
          <div className="grid min-w-0 grid-rows-[1fr_auto] bg-[var(--paper)] text-[var(--paper-foreground)]">
            <article className="mx-auto w-full max-w-xl px-6 py-8 sm:px-9 sm:py-10">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--paper-muted)]">
                {t("landing", "preview.chapter")}
              </p>
              <h2 className="mt-3 font-serif text-2xl font-semibold sm:text-3xl">
                {t("landing", "preview.documentTitle")}
              </h2>
              <p className="mt-5 font-serif text-sm leading-7 text-[var(--paper-muted)] sm:text-base">
                {t("landing", "preview.paragraphBefore")}{" "}
                <mark className="rounded-sm bg-[#f4d97b]/70 px-1 text-inherit">
                  {t("landing", "preview.highlight")}
                </mark>{" "}
                {t("landing", "preview.paragraphAfter")}
              </p>
              <div className="mt-6 border-l-2 border-[#b5663f] pl-4">
                <p className="font-serif text-sm italic leading-6">
                  “{t("landing", "preview.quote")}”
                </p>
                <p className="mt-2 text-xs font-semibold text-[#8b4d31]">
                  {t("landing", "preview.sourcePage")}
                </p>
              </div>
            </article>
            <div className="m-4 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-[var(--foreground)] shadow-sm sm:m-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">
                <MessageSquareQuote aria-hidden="true" size={15} />
                {t("landing", "preview.assistant")}
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {t("landing", "preview.answer")}
              </p>
              <button
                className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md bg-[var(--accent-soft)] px-3 text-xs font-semibold text-[var(--accent-strong)]"
                type="button"
              >
                <Search aria-hidden="true" size={13} />
                {t("landing", "preview.citation")}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-xs font-semibold shadow-lg md:flex">
        <StickyNote aria-hidden="true" className="text-[var(--accent-strong)]" size={15} />
        {t("landing", "preview.noteSaved")}
      </div>
      <div className="absolute -right-3 top-20 hidden items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-xs font-semibold shadow-lg md:flex">
        <Languages aria-hidden="true" className="text-[var(--accent-strong)]" size={15} />
        {t("landing", "preview.vietnameseReady")}
      </div>
    </section>
  );
}

function SectionIntro({
  eyebrow,
  title,
  description,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
        {eyebrow}
      </p>
      <h2 className="mt-4 font-serif text-3xl font-semibold tracking-[-0.025em] sm:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-lg leading-8 text-[var(--muted)]">{description}</p>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  index,
  title,
  description,
}: {
  icon: LucideIcon;
  index: string;
  title: string;
  description: string;
}) {
  return (
    <article className="group min-h-64 border border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="flex items-center justify-between">
        <Icon aria-hidden="true" className="text-[var(--accent-strong)]" size={23} />
        <span className="font-mono text-xs text-[var(--muted)]">{index}</span>
      </div>
      <h3 className="mt-12 text-xl font-semibold">{title}</h3>
      <p className="mt-3 leading-7 text-[var(--muted)]">{description}</p>
    </article>
  );
}

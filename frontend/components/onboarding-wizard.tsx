"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  FlaskConical,
  GraduationCap,
  LoaderCircle,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useI18n } from "@/components/i18n-provider";
import {
  fetchOnboarding,
  saveOnboarding,
  skipOnboarding,
  type DisplayPreference,
  type ReadingGoal,
  type ReadingType,
} from "@/lib/personalization-api";

const READING_TYPES = [
  ["STUDY", GraduationCap],
  ["RESEARCH", FlaskConical],
  ["WORK", BriefcaseBusiness],
  ["BOOKS", BookOpen],
  ["TECHNICAL", Wrench],
] as const;

const READING_GOALS = [
  "UNDERSTAND",
  "REMEMBER",
  "REFERENCE",
  "COMPLETE",
] as const satisfies readonly ReadingGoal[];

const DISPLAY_PREFERENCES = [
  "AUTO",
  "BOOK",
  "CLEAN",
  "STUDY",
] as const satisfies readonly DisplayPreference[];

export function OnboardingWizard() {
  const router = useRouter();
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [readingTypes, setReadingTypes] = useState<ReadingType[]>([]);
  const [readingGoal, setReadingGoal] = useState<ReadingGoal | null>(null);
  const [displayPreference, setDisplayPreference] =
    useState<DisplayPreference>("AUTO");
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchOnboarding()
      .then((profile) => {
        if (!active) return;
        if (profile.status !== "NOT_STARTED") {
          router.replace("/dashboard");
          return;
        }
        setReadingTypes(profile.reading_types);
        setReadingGoal(profile.reading_goal);
        setDisplayPreference(profile.display_preference ?? "AUTO");
        setAnalyticsEnabled(profile.analytics_enabled);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(t("personalization", "onboarding.error"));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router, t]);

  function toggleReadingType(value: ReadingType) {
    setReadingTypes((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  async function skip() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await skipOnboarding();
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(t("personalization", "onboarding.error"));
      setSubmitting(false);
    }
  }

  async function complete() {
    if (submitting || !readingGoal || readingTypes.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      await saveOnboarding({
        analytics_enabled: analyticsEnabled,
        display_preference: displayPreference,
        reading_goal: readingGoal,
        reading_types: readingTypes,
      });
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(t("personalization", "onboarding.error"));
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div
        aria-label={t("personalization", "onboarding.loading")}
        className="mx-auto h-96 w-full max-w-3xl animate-pulse rounded-3xl bg-[var(--surface-muted)]"
      />
    );
  }

  const canContinue =
    (step === 0 && readingTypes.length > 0) ||
    (step === 1 && readingGoal !== null) ||
    step === 2;

  return (
    <section className="mx-auto w-full max-w-3xl py-10 sm:py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">
            {t("personalization", "onboarding.eyebrow")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            {t("personalization", "onboarding.title")}
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            {t("personalization", "onboarding.description")}
          </p>
        </div>
        <button
          className="min-h-11 rounded-lg px-4 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--surface-muted)] disabled:opacity-60"
          disabled={submitting}
          onClick={() => void skip()}
          type="button"
        >
          {submitting
            ? t("personalization", "onboarding.skipping")
            : t("personalization", "onboarding.skip")}
        </button>
      </div>

      <div className="mt-8 flex items-center gap-3">
        {[0, 1, 2].map((item) => (
          <div
            aria-hidden="true"
            className={`h-1.5 flex-1 rounded-full ${
              item <= step ? "bg-[var(--accent)]" : "bg-[var(--surface-muted)]"
            }`}
            key={item}
          />
        ))}
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">
        {t("personalization", "onboarding.progress", {
          current: step + 1,
          total: 3,
        })}
      </p>

      <div className="mt-6 min-h-[360px] rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl sm:p-8">
        {step === 0 ? (
          <>
            <h2 className="text-2xl font-semibold">
              {t("personalization", "onboarding.steps.typesTitle")}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {t("personalization", "onboarding.steps.typesDescription")}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {READING_TYPES.map(([value, Icon]) => {
                const selected = readingTypes.includes(value);
                return (
                  <button
                    aria-pressed={selected}
                    className={`flex min-h-16 items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] hover:bg-[var(--surface-muted)]"
                    }`}
                    key={value}
                    onClick={() => toggleReadingType(value)}
                    type="button"
                  >
                    <Icon aria-hidden="true" className="shrink-0" size={21} />
                    <span className="font-semibold">
                      {t("personalization", `onboarding.types.${value}`)}
                    </span>
                    {selected ? (
                      <Check
                        aria-hidden="true"
                        className="ml-auto text-[var(--accent)]"
                        size={18}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h2 className="text-2xl font-semibold">
              {t("personalization", "onboarding.steps.goalTitle")}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {t("personalization", "onboarding.steps.goalDescription")}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {READING_GOALS.map((value) => (
                <button
                  aria-pressed={readingGoal === value}
                  className={`min-h-16 rounded-xl border p-4 text-left font-semibold transition-colors ${
                    readingGoal === value
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] hover:bg-[var(--surface-muted)]"
                  }`}
                  key={value}
                  onClick={() => setReadingGoal(value)}
                  type="button"
                >
                  {t("personalization", `onboarding.goals.${value}`)}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h2 className="text-2xl font-semibold">
              {t("personalization", "onboarding.steps.displayTitle")}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {t("personalization", "onboarding.steps.displayDescription")}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {DISPLAY_PREFERENCES.map((value) => (
                <button
                  aria-pressed={displayPreference === value}
                  className={`min-h-24 rounded-xl border p-4 text-left transition-colors ${
                    displayPreference === value
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] hover:bg-[var(--surface-muted)]"
                  }`}
                  key={value}
                  onClick={() => setDisplayPreference(value)}
                  type="button"
                >
                  <strong className="block">
                    {t(
                      "personalization",
                      `onboarding.displays.${value}.title`,
                    )}
                  </strong>
                  <span className="mt-1 block text-sm text-[var(--muted)]">
                    {t(
                      "personalization",
                      `onboarding.displays.${value}.description`,
                    )}
                  </span>
                </button>
              ))}
            </div>
            <label className="mt-5 flex cursor-pointer gap-3 rounded-xl border border-[var(--border)] p-4">
              <input
                checked={analyticsEnabled}
                className="mt-1 size-5 accent-[var(--accent)]"
                onChange={(event) => setAnalyticsEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong className="block">
                  {t("personalization", "onboarding.analytics.title")}
                </strong>
                <span className="mt-1 block text-sm text-[var(--muted)]">
                  {t("personalization", "onboarding.analytics.description")}
                </span>
              </span>
            </label>
          </>
        ) : null}
      </div>

      {error ? (
        <p
          className="mt-4 rounded-xl bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-4">
        <button
          className="flex min-h-12 items-center gap-2 rounded-lg border border-[var(--border)] px-5 font-semibold disabled:invisible"
          disabled={step === 0 || submitting}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={18} />
          {t("personalization", "onboarding.back")}
        </button>
        <button
          className="flex min-h-12 items-center gap-2 rounded-lg bg-[var(--accent)] px-6 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canContinue || submitting}
          onClick={() =>
            step < 2
              ? setStep((current) => Math.min(2, current + 1))
              : void complete()
          }
          type="button"
        >
          {submitting ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />
          ) : null}
          {submitting
            ? t("personalization", "onboarding.saving")
            : step < 2
              ? t("personalization", "onboarding.next")
              : t("personalization", "onboarding.complete")}
          {!submitting && step < 2 ? (
            <ArrowRight aria-hidden="true" size={18} />
          ) : null}
        </button>
      </div>
    </section>
  );
}

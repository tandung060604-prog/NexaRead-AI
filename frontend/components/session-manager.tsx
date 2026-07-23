"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, MonitorSmartphone, Trash2 } from "lucide-react";

import {
  fetchAuthSessions,
  friendlyAuthError,
  revokeAllAuthSessions,
  revokeAuthSession,
  type AuthSession,
} from "@/lib/auth-api";
import { useI18n } from "@/components/i18n-provider";

export function SessionManager() {
  const { locale, t, formatDate } = useI18n();
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchAuthSessions()
      .then((items) => {
        if (active) setSessions(items);
      })
      .catch((loadError: unknown) => {
        if (active) setError(friendlyAuthError(loadError, locale));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [locale]);

  async function revoke(sessionId: string) {
    setBusyId(sessionId);
    setError("");
    try {
      await revokeAuthSession(sessionId);
      setSessions((current) => current.filter((item) => item.id !== sessionId));
      if (sessions.find((item) => item.id === sessionId)?.current) {
        window.location.assign("/login");
      }
    } catch (revokeError) {
      setError(friendlyAuthError(revokeError, locale));
    } finally {
      setBusyId(null);
    }
  }

  async function revokeAll() {
    setBusyId("all");
    setError("");
    try {
      await revokeAllAuthSessions();
      window.location.assign("/login");
    } catch (revokeError) {
      setError(friendlyAuthError(revokeError, locale));
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <p className="mt-8 flex items-center gap-2 text-[var(--muted)]">
        <LoaderCircle className="animate-spin" size={18} />{" "}
        {t("common", "account.loadingSessions")}
      </p>
    );
  }

  return (
    <div className="mt-8">
      {error ? <p className="mb-4 text-sm text-red-400" role="alert">{error}</p> : null}
      <div className="space-y-3">
        {sessions.map((session) => (
          <article
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            key={session.id}
          >
            <div className="flex min-w-0 items-start gap-3">
              <MonitorSmartphone aria-hidden="true" className="mt-1 shrink-0" size={20} />
              <div>
                <h2 className="font-semibold">
                  {session.current
                    ? t("common", "account.currentDevice")
                    : t("common", "account.otherSession")}
                </h2>
                <p className="mt-1 break-words text-sm text-[var(--muted)]">
                  {session.user_agent ?? t("common", "account.unknownDevice")}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {t("common", "account.expires", {
                    date: formatDate(session.expires_at, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
                </p>
              </div>
            </div>
            <button
              aria-label={
                session.current
                  ? t("common", "account.revokeCurrent")
                  : t("common", "account.revokeSession")
              }
              className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-[var(--border)] text-red-400 disabled:opacity-50"
              disabled={busyId !== null}
              onClick={() => void revoke(session.id)}
              type="button"
            >
              {busyId === session.id ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <Trash2 size={18} />
              )}
            </button>
          </article>
        ))}
      </div>
      <button
        className="mt-6 rounded-lg border border-red-400/40 px-5 py-3 text-sm font-semibold text-red-400 disabled:opacity-50"
        disabled={busyId !== null}
        onClick={() => void revokeAll()}
        type="button"
      >
        {t("common", "account.revokeAll")}
      </button>
    </div>
  );
}

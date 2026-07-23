"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import {
  friendlyAuthError,
  loginAccount,
  registerAccount,
} from "@/lib/auth-api";

type AuthFormProps = {
  mode: "login" | "register";
};

function safeReturnPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();
  const { locale, t } = useI18n();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isRegister = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    if (password.length < (isRegister ? 10 : 1)) {
      setError(t("auth", "form.passwordLength"));
      return;
    }
    setSubmitting(true);
    try {
      const user = isRegister
        ? await registerAccount({
            email,
            display_name: displayName,
            password,
          })
        : await loginAccount({ email, password });
      setUser(user);
      router.replace(
        isRegister
          ? "/onboarding"
          : safeReturnPath(searchParams.get("returnTo")),
      );
      router.refresh();
    } catch (submitError) {
      setError(friendlyAuthError(submitError, locale));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="mt-8 space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl sm:p-8"
      onSubmit={submit}
    >
      {isRegister ? (
        <label className="block text-sm font-medium">
          {t("auth", "form.displayName")}
          <input
            autoComplete="name"
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 outline-none focus:border-[var(--accent)]"
            maxLength={120}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            value={displayName}
          />
        </label>
      ) : null}
      <label className="block text-sm font-medium">
        {t("auth", "form.email")}
        <input
          autoComplete="email"
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 outline-none focus:border-[var(--accent)]"
          maxLength={320}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label className="block text-sm font-medium">
        {t("auth", "form.password")}
        <span className="relative mt-2 block">
          <input
            autoComplete={isRegister ? "new-password" : "current-password"}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 pr-12 outline-none focus:border-[var(--accent)]"
            minLength={isRegister ? 10 : 1}
            onChange={(event) => setPassword(event.target.value)}
            required
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={
              showPassword
                ? t("auth", "form.hidePassword")
                : t("auth", "form.showPassword")
            }
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[var(--muted)]"
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
      {error ? (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={submitting}
        type="submit"
      >
        {submitting ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : null}
        {submitting
          ? t("auth", "form.submitting")
          : isRegister
            ? t("auth", "register.submit")
            : t("auth", "login.submit")}
      </button>
      <p className="text-center text-sm text-[var(--muted)]">
        {isRegister
          ? t("auth", "register.alternatePrompt")
          : t("auth", "login.alternatePrompt")}{" "}
        <Link
          className="font-semibold text-[var(--accent-strong)]"
          href={isRegister ? "/login" : "/register"}
        >
          {isRegister
            ? t("auth", "register.alternateAction")
            : t("auth", "login.alternateAction")}
        </Link>
      </p>
    </form>
  );
}

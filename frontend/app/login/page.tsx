"use client";

import { Suspense } from "react";

import { AuthForm } from "@/components/auth-form";
import { useI18n } from "@/components/i18n-provider";

export default function LoginPage() {
  const { t } = useI18n();
  return (
    <section className="mx-auto w-full max-w-md py-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">
        {t("auth", "login.eyebrow")}
      </p>
      <h1 className="mt-3 text-3xl font-semibold">{t("auth", "login.title")}</h1>
      <p className="mt-3 text-[var(--muted)]">
        {t("auth", "login.description")}
      </p>
      <Suspense fallback={<p className="mt-8">{t("auth", "form.loading")}</p>}>
        <AuthForm mode="login" />
      </Suspense>
    </section>
  );
}

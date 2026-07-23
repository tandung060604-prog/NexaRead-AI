"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  CircleUserRound,
  Layers,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Moon,
  Sun,
  UploadCloud,
  X,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSelector } from "@/components/language-selector";

const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/health"]);

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const { t } = useI18n();
  const isReader = pathname?.includes("/read");
  const isPublic = PUBLIC_PATHS.has(pathname ?? "/");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [publicTheme, setPublicTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    if (!isPublic && !loading && !user) {
      const returnTo = pathname?.startsWith("/") ? pathname : "/library";
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [isPublic, loading, pathname, router, user]);

  async function signOut() {
    await logout();
    router.replace("/login");
    router.refresh();
  }
  const skipLink = (
    <a
      className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-[var(--accent)] px-4 py-3 font-semibold text-white transition-transform focus:translate-y-0"
      href="#main-content"
    >
      {t("common", "accessibility.skipToContent")}
    </a>
  );

  if (isReader) {
    return (
      <>
        {skipLink}
        <main
          className="w-full bg-[var(--background)]"
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </>
    );
  }

  if (isPublic) {
    const marketingLinks = [
      ["product", t("landing", "nav.product")],
      ["features", t("landing", "nav.features")],
      ["how-it-works", t("landing", "nav.how")],
      ["audience", t("landing", "nav.audience")],
      ["privacy", t("landing", "nav.privacy")],
      ["faq", t("landing", "nav.faq")],
    ];
    return (
      <div
        className="public-shell min-h-screen bg-[var(--background)] text-[var(--foreground)]"
        data-public-theme={publicTheme}
      >
        {skipLink}
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/94">
          <div className="mx-auto flex min-h-16 max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6">
            <Link
              className="flex min-h-11 shrink-0 items-center gap-3 font-bold"
              href="/"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="grid size-9 place-items-center rounded-lg bg-[var(--accent)] text-white">
                <Layers size={18} />
              </span>
              NexaRead
            </Link>
            <nav
              aria-label={t("common", "nav.public")}
              className="hidden items-center gap-1 lg:flex"
            >
              {marketingLinks.map(([id, label]) => (
                <Link
                  className="inline-flex min-h-11 items-center px-2.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] xl:px-3"
                  href={`/#${id}`}
                  key={id}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="hidden shrink-0 items-center gap-2 lg:flex">
              <button
                aria-label={
                  publicTheme === "dark"
                    ? t("landing", "theme.light")
                    : t("landing", "theme.dark")
                }
                className="grid size-11 place-items-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                onClick={() => setPublicTheme((theme) => theme === "dark" ? "light" : "dark")}
                type="button"
              >
                {publicTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <LanguageSelector compact />
              {user ? (
                <>
                  <Link className="inline-flex min-h-11 items-center px-3 text-sm font-semibold" href="/dashboard">
                    {t("common", "nav.dashboard")}
                  </Link>
                  <Link
                    className="inline-flex min-h-11 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white"
                    href="/account"
                  >
                    {user.display_name}
                  </Link>
                </>
              ) : (
                <>
                  <Link className="inline-flex min-h-11 items-center px-3 text-sm font-semibold" href="/login">
                    {t("common", "nav.login")}
                  </Link>
                  <Link
                    className="inline-flex min-h-11 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white"
                    href="/register"
                  >
                    {t("common", "nav.register")}
                  </Link>
                </>
              )}
            </div>
            <button
              aria-controls="public-mobile-menu"
              aria-expanded={mobileMenuOpen}
              aria-label={
                mobileMenuOpen
                  ? t("landing", "nav.closeMenu")
                  : t("landing", "nav.openMenu")
              }
              className="grid size-11 place-items-center rounded-lg border border-[var(--border)] lg:hidden"
              onClick={() => setMobileMenuOpen((open) => !open)}
              type="button"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
          {mobileMenuOpen ? (
            <div
              className="border-t border-[var(--border)] bg-[var(--background)] px-4 py-4 lg:hidden"
              id="public-mobile-menu"
            >
              <nav
                aria-label={t("landing", "nav.mobile")}
                className="mx-auto grid max-w-[90rem] gap-1"
              >
                {marketingLinks.map(([id, label]) => (
                  <Link
                    className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-[var(--surface-muted)]"
                    href={`/#${id}`}
                    key={id}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
              <div className="mx-auto mt-3 flex max-w-[90rem] items-center gap-2 border-t border-[var(--border)] pt-3">
                <button
                  aria-label={
                    publicTheme === "dark"
                      ? t("landing", "theme.light")
                      : t("landing", "theme.dark")
                  }
                  className="grid size-11 place-items-center rounded-full border border-[var(--border)]"
                  onClick={() => setPublicTheme((theme) => theme === "dark" ? "light" : "dark")}
                  type="button"
                >
                  {publicTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                <LanguageSelector compact />
                <Link
                  className="ml-auto inline-flex min-h-11 items-center px-3 text-sm font-semibold"
                  href={user ? "/dashboard" : "/login"}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {user ? t("common", "nav.dashboard") : t("common", "nav.login")}
                </Link>
                <Link
                  className="inline-flex min-h-11 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white"
                  href={user ? "/account" : "/register"}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {user ? t("common", "nav.account") : t("common", "nav.register")}
                </Link>
              </div>
            </div>
          ) : null}
        </header>
        <main
          className={
            pathname === "/"
              ? "w-full"
              : "mx-auto w-full max-w-7xl px-5"
          }
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    );
  }

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--background)] text-[var(--muted)]">
        {t("common", "status.authenticating")}
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] selection:bg-[var(--accent)] selection:text-white">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[rgba(94,106,210,0.15)] via-[var(--background)] to-[var(--background)] opacity-70" />
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col justify-between border-r border-[var(--border)] bg-[var(--surface)]/40 px-6 py-8 backdrop-blur-xl sm:flex">
        <div className="flex w-full flex-col gap-10">
          <Link className="group flex items-center gap-3 text-lg font-bold" href="/dashboard">
            <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent)] text-white">
              <Layers size={20} />
            </span>
            <span>NexaRead</span>
          </Link>
          <nav aria-label={t("common", "nav.primary")} className="flex w-full flex-col gap-3">
            <AppLink
              active={pathname === "/dashboard"}
              href="/dashboard"
              icon={<LayoutDashboard size={18} />}
              label={t("common", "nav.dashboard")}
            />
            <AppLink
              active={pathname === "/library"}
              href="/library"
              icon={<Library size={18} />}
              label={t("common", "nav.library")}
            />
            <AppLink
              active={pathname === "/upload"}
              href="/upload"
              icon={<UploadCloud size={18} />}
              label={t("common", "nav.upload")}
            />
            <AppLink
              active={pathname?.startsWith("/account") ?? false}
              href="/account"
              icon={<CircleUserRound size={18} />}
              label={t("common", "nav.account")}
            />
          </nav>
        </div>
        <div className="w-full">
          <p className="truncate text-sm font-semibold">{user.display_name}</p>
          <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>
          <button
            aria-label={t("common", "nav.logout")}
            className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold"
            onClick={() => void signOut()}
            type="button"
          >
            <LogOut size={17} />
            <span>{t("common", "nav.logout")}</span>
          </button>
        </div>
      </aside>
      {skipLink}
      <main
        className="relative z-10 flex min-h-screen min-w-0 flex-col px-4 pb-24 pt-5 sm:ml-64 sm:px-12 sm:pb-10 sm:pt-10 xl:px-20"
        id="main-content"
        tabIndex={-1}
      >
        <header className="mb-8 flex min-h-12 items-center gap-3 border-b border-[var(--border)] pb-4">
          <Link
            className="mr-auto flex min-h-11 items-center gap-2 font-bold sm:hidden"
            href="/dashboard"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-[var(--accent)] text-white">
              <Layers size={18} />
            </span>
            <span className="hidden min-[390px]:inline">NexaRead</span>
          </Link>
          <LanguageSelector compact />
          <Link
            aria-label={`Tài khoản của ${user.display_name}`}
            className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-1 hover:bg-[var(--surface-muted)]"
            href="/account"
          >
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] font-semibold text-white"
            >
              {user.display_name.trim().charAt(0).toLocaleUpperCase()}
            </span>
            <span className="hidden max-w-48 truncate text-sm font-semibold sm:inline">
              {user.display_name}
            </span>
          </Link>
          <button
            aria-label={t("common", "nav.logout")}
            className="grid size-10 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={() => void signOut()}
            type="button"
          >
            <LogOut size={17} />
          </button>
        </header>
        {children}
      </main>
      <nav
        aria-label={t("common", "nav.mobilePrimary")}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[var(--border)] bg-[var(--surface)]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:hidden"
      >
        <AppLink
          active={pathname === "/dashboard"}
          href="/dashboard"
          icon={<LayoutDashboard size={18} />}
          label={t("common", "nav.dashboard")}
          mobile
        />
        <AppLink
          active={pathname === "/library"}
          href="/library"
          icon={<Library size={18} />}
          label={t("common", "nav.library")}
          mobile
        />
        <AppLink
          active={pathname === "/upload"}
          href="/upload"
          icon={<UploadCloud size={18} />}
          label={t("common", "nav.upload")}
          mobile
        />
        <AppLink
          active={pathname?.startsWith("/account") ?? false}
          href="/account"
          icon={<CircleUserRound size={18} />}
          label={t("common", "nav.account")}
          mobile
        />
      </nav>
    </div>
  );
}

function AppLink({
  active,
  href,
  icon,
  label,
  mobile = false,
}: {
  active: boolean;
  href: string;
  icon: ReactNode;
  label: string;
  mobile?: boolean;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={`flex min-h-11 items-center rounded-lg text-sm font-medium transition-colors ${
        mobile
          ? "flex-col justify-center gap-1 px-1 py-1"
          : "gap-3 px-3"
      } ${
        active
          ? "bg-[var(--accent)]/10 text-[var(--accent-strong)]"
          : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
      }`}
      href={href}
    >
      {icon}
      <span className={mobile ? "text-[10px] leading-none" : ""}>{label}</span>
    </Link>
  );
}

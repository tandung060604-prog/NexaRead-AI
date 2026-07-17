import Link from "next/link";
import type { ReactNode } from "react";

type SiteShellProps = {
  children: ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5">
          <Link className="text-lg font-semibold text-[var(--accent-strong)]" href="/">
            NexaRead AI
          </Link>
          <nav aria-label="Primary navigation" className="flex items-center gap-5">
            <Link className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]" href="/library">
              Library
            </Link>
            <Link className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]" href="/upload">
              Upload
            </Link>
            <Link
              className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
              href="/health"
            >
              Health
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-1 px-5 py-10">{children}</main>
      <footer className="border-t border-[var(--border)] px-5 py-6 text-center text-sm text-[var(--muted)]">
        NexaRead AI document library
      </footer>
    </div>
  );
}

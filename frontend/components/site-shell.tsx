"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Layers, Library, UploadCloud, Activity } from "lucide-react";

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isReader = pathname?.includes("/read");

  if (isReader) {
    return <main className="w-full bg-[var(--background)]">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)] selection:bg-[var(--accent)] selection:text-white">
      {/* Ambient background for lobby */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[rgba(94,106,210,0.15)] via-[var(--background)] to-[var(--background)] opacity-70" />

      {/* Sidebar Navigation */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-20 flex-col items-center justify-between border-r border-[var(--border)] bg-[var(--surface)]/40 py-8 backdrop-blur-xl sm:w-64 sm:items-start sm:px-6 transition-all duration-300">
        <div className="flex flex-col items-center gap-10 sm:items-start w-full">
          <Link className="flex items-center gap-3 text-lg font-bold text-[var(--foreground)] group" href="/">
            <div className="relative flex size-10 items-center justify-center rounded-xl bg-gradient-to-b from-[var(--accent)] to-indigo-600 shadow-md shadow-[var(--accent-soft)] transition-transform group-hover:scale-105">
              <div className="absolute inset-[1px] rounded-xl bg-gradient-to-b from-white/20 to-transparent mix-blend-overlay" />
              <Layers className="relative z-10 text-white drop-shadow-sm" size={20} strokeWidth={1.5} />
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="bg-gradient-to-b from-[var(--foreground)] to-[var(--muted)] bg-clip-text font-extrabold tracking-tighter text-transparent leading-tight">
                NexaRead
              </span>
            </div>
          </Link>

          <nav aria-label="Primary navigation" className="flex flex-col gap-4 w-full">
            <Link
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${pathname === "/library" ? "bg-[var(--accent)]/10 text-[var(--accent-strong)]" : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"}`}
              href="/library"
            >
              <Library size={18} />
              <span className="hidden sm:inline">Library</span>
            </Link>
            <Link
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${pathname === "/upload" ? "bg-[var(--accent)]/10 text-[var(--accent-strong)]" : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"}`}
              href="/upload"
            >
              <UploadCloud size={18} />
              <span className="hidden sm:inline">Upload</span>
            </Link>
            <Link
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${pathname === "/health" ? "bg-[var(--accent)]/10 text-[var(--accent-strong)]" : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"}`}
              href="/health"
            >
              <Activity size={18} />
              <span className="hidden sm:inline">Health</span>
            </Link>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative z-10 ml-20 flex min-h-screen w-full flex-col px-6 py-10 sm:ml-64 sm:px-12 xl:px-20 transition-all duration-300">
        {children}
      </main>
    </div>
  );
}

import Link from "next/link";
import Image from "next/image";
import { Sparkles, MoveRight, Layers } from "lucide-react";

export default function HomePage() {
  return (
    <div className="relative flex min-h-[calc(100vh-5rem)] w-full flex-col items-center justify-center pt-20 pb-32 text-center overflow-hidden rounded-3xl border border-[var(--border)] shadow-2xl bg-[var(--background)]">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slow-pan {
          0% { transform: scale(1) translate(0, 0); }
          50% { transform: scale(1.08) translate(-1%, 1%); }
          100% { transform: scale(1) translate(0, 0); }
        }
        .animate-slow-pan {
          animation: slow-pan 30s ease-in-out infinite;
        }
      `}} />

      {/* Background Image */}
      <div className="absolute inset-0 z-0 overflow-hidden rounded-3xl">
        <Image
          src="/bg-home-bright.png"
          alt="NexaRead Digital Library"
          fill
          priority
          className="object-cover animate-slow-pan opacity-60 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/80 to-[var(--background)]/20" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-4">
        {/* Sophisticated Logo */}
        <div className="mb-8 flex flex-col items-center justify-center gap-4">
          <div className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-b from-[var(--accent)] to-indigo-600 shadow-[0_0_40px_rgba(99,102,241,0.4)]">
            <div className="absolute inset-[1px] rounded-2xl bg-gradient-to-b from-white/20 to-transparent mix-blend-overlay" />
            <Layers className="relative z-10 text-white drop-shadow-md" size={32} strokeWidth={1.5} />
          </div>
          <div className="flex flex-col items-center">
            <span className="bg-gradient-to-b from-[var(--foreground)] to-[var(--muted)] bg-clip-text text-4xl font-extrabold tracking-tighter text-transparent">
              NexaRead
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">
              Intelligent Workspace
            </span>
          </div>
        </div>

        {/* Hero Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-2 text-sm font-medium text-[var(--accent)] shadow-[0_0_15px_rgba(94,106,210,0.15)] backdrop-blur-md">
          <Sparkles size={16} />
          <span>Immersive Reading Experience</span>
        </div>

        {/* Hero Title */}
        <h1 className="max-w-4xl text-5xl font-bold leading-tight tracking-tight text-[var(--foreground)] sm:text-7xl drop-shadow-sm">
          Enter your private <br /> digital library
        </h1>

        {/* Hero Subtitle */}
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-[var(--muted)] sm:text-xl font-medium">
          NexaRead AI is your personal, source-grounded knowledge space. Step away from distractions and immerse yourself in reading.
        </p>

        {/* CTA Buttons */}
        <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            className="group relative inline-flex h-14 items-center justify-center gap-3 overflow-hidden rounded-xl bg-[var(--accent)] px-10 text-base font-semibold text-white shadow-xl shadow-[var(--accent)]/20 transition-all hover:bg-[var(--accent-strong)] hover:shadow-[var(--accent)]/40 hover:scale-105"
            href="/library"
          >
            <Layers size={20} />
            <span>Open Library</span>
            <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-12deg)_translateX(-150%)] group-hover:duration-1000 group-hover:[transform:skew(-12deg)_translateX(150%)]">
              <div className="relative h-full w-8 bg-white/20" />
            </div>
          </Link>
          <Link
            className="group inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-[var(--surface)] backdrop-blur-md px-10 text-base font-medium text-[var(--foreground)] border border-[var(--border)] transition-all hover:bg-[var(--surface-muted)] hover:border-[var(--border-strong)] shadow-sm"
            href="/upload"
          >
            <span>Upload Document</span>
            <MoveRight size={18} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="relative z-10 mt-32 grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3 px-6">
        {[
          { title: "Immersive Rooms", desc: "Read in focused environments with ambient audio." },
          { title: "Source Grounded", desc: "Never lose track of where your knowledge comes from." },
          { title: "Intelligent Indexing", desc: "Your documents, organized and fully searchable." }
        ].map((feat, i) => (
          <div key={i} className="group flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-8 backdrop-blur-xl transition-all hover:bg-[var(--surface)] hover:border-[var(--border-strong)] shadow-lg hover:shadow-xl">
            <h3 className="text-lg font-bold text-[var(--foreground)] transition-colors group-hover:text-[var(--accent)]">{feat.title}</h3>
            <p className="text-sm text-[var(--muted)]">{feat.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

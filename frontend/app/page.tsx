import Link from "next/link";

export default function HomePage() {
  return (
    <section className="grid w-full content-center gap-8 py-8 md:grid-cols-[minmax(0,1fr)_18rem] md:items-center">
      <div className="max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase text-[var(--accent)]">PDF library</p>
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">NexaRead AI</h1>
        <p className="mt-5 text-lg leading-8 text-[var(--muted)]">
          Upload and organize the PDFs you want to turn into source-grounded knowledge.
        </p>
        <Link
          className="mt-8 inline-flex min-h-11 items-center bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
          href="/upload"
        >
          Upload a PDF
        </Link>
      </div>
      <div className="border-l-4 border-[var(--accent)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">Document workflow</p>
        <p className="mt-2 text-2xl font-semibold">Upload. Organize. Return.</p>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Your original PDFs stay organized with version and processing metadata.
        </p>
      </div>
    </section>
  );
}

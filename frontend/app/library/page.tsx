import Link from "next/link";

import { DocumentLibrary } from "@/components/document-library";

export default function LibraryPage() {
  return (
    <section className="w-full py-4">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase text-[var(--accent)]">Your documents</p>
          <h1 className="mt-3 text-3xl font-semibold">Library</h1>
        </div>
        <Link className="bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white" href="/upload">
          Upload PDF
        </Link>
      </div>
      <DocumentLibrary />
    </section>
  );
}


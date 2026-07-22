import { UploadForm } from "@/components/upload-form";

export default function UploadPage() {
  return (
    <section className="w-full py-4">
      <p className="text-sm font-semibold uppercase text-[var(--accent)]">Add document</p>
      <h1 className="mt-3 text-3xl font-semibold">Add a document</h1>
      <p className="mb-8 mt-3 max-w-2xl leading-7 text-[var(--muted)]">
        Upload a PDF, DOCX, or EPUB, or import a public article URL. NexaRead will structure and index it for reading and grounded chat.
      </p>
      <UploadForm />
    </section>
  );
}


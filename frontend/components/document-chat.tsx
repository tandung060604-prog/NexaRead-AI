"use client";

import { FormEvent, useState } from "react";

import { askDocument, RagMessage } from "@/lib/rag-api";

type ConversationItem =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; message: RagMessage };

export function DocumentChat({
  documentId,
  onCitation,
}: {
  documentId: string;
  onCitation: (contentBlockId: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = question.trim();
    if (normalized.length < 2 || loading) return;
    const userItem: ConversationItem = {
      id: `user-${Date.now()}`,
      role: "user",
      content: normalized,
    };
    setConversation((items) => [...items, userItem]);
    setQuestion("");
    setLoading(true);
    setError(null);
    try {
      const message = await askDocument(documentId, normalized, sessionId);
      setSessionId(message.session_id);
      setConversation((items) => [
        ...items,
        { id: message.id, role: "assistant", message },
      ]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Document chat failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-label="Ask this document" className="text-sm">
      <h2 className="text-xs font-semibold uppercase text-[var(--reader-muted)]">
        Ask this document
      </h2>
      <div aria-live="polite" className="mt-3 max-h-80 space-y-3 overflow-y-auto">
        {conversation.length === 0 ? (
          <p className="leading-5 text-[var(--reader-muted)]">
            Answers are grounded in this document and include source links.
          </p>
        ) : null}
        {conversation.map((item) =>
          item.role === "user" ? (
            <p className="rounded-md bg-[var(--reader-surface-muted)] p-3" key={item.id}>
              {item.content}
            </p>
          ) : (
            <article className="border-l-2 border-[var(--reader-accent)] pl-3" key={item.id}>
              <p className="whitespace-pre-wrap leading-6">{item.message.content}</p>
              {item.message.citations.length ? (
                <div aria-label="Answer sources" className="mt-2 flex flex-wrap gap-2">
                  {item.message.citations.map((citation) => (
                    <button
                      className="rounded-full border border-[var(--reader-border)] px-2 py-1 text-xs font-semibold hover:border-[var(--reader-accent)]"
                      key={citation.id}
                      onClick={() => onCitation(citation.content_block_id)}
                      title={citation.quoted_text}
                      type="button"
                    >
                      {citation.source_label} · p.{citation.page_number}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ),
        )}
      </div>
      <form className="mt-3" onSubmit={submit}>
        <label className="sr-only" htmlFor={`document-question-${documentId}`}>
          Ask a question about this document
        </label>
        <textarea
          className="min-h-20 w-full resize-y rounded-md border border-[var(--reader-border)] bg-transparent p-3 outline-none focus:border-[var(--reader-accent)]"
          disabled={loading}
          id={`document-question-${documentId}`}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about this document…"
          value={question}
        />
        <button
          className="mt-2 w-full rounded-md bg-[var(--reader-accent)] px-3 py-2 font-semibold text-white disabled:opacity-50"
          disabled={loading || question.trim().length < 2}
          type="submit"
        >
          {loading ? "Checking sources…" : "Ask"}
        </button>
      </form>
      {error ? <p className="mt-2 text-[var(--danger)]" role="alert">{error}</p> : null}
    </section>
  );
}

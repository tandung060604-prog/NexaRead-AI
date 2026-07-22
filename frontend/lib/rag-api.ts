const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type RagCitation = {
  id: string;
  source_label: string;
  chunk_id: string;
  content_block_id: string;
  quoted_text: string;
  page_number: number;
  section_title: string | null;
  relevance_score: number;
};

export type RagMessage = {
  id: string;
  session_id: string;
  role: "assistant";
  content: string;
  model: string | null;
  latency_ms: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost_microusd: number;
  status: string;
  citations: RagCitation[];
  created_at: string;
};

export async function askDocument(
  documentId: string,
  question: string,
  sessionId?: string,
): Promise<RagMessage> {
  const response = await fetch(`${API_URL}/api/documents/${documentId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId ?? null, stream: false }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "Document chat is unavailable.");
  }
  return response.json() as Promise<RagMessage>;
}

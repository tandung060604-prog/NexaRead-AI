import { authenticatedFetch } from "@/lib/auth-api";
import type { ReadingMode } from "@/lib/reading-preferences";

export type DocumentVersion = {
  id: string;
  version_number: number;
  content_hash: string;
  page_count: number | null;
  cover_source: string | null;
  created_at: string;
};

export type ProcessingJob = {
  id: string;
  job_type: string;
  status: string;
  progress: number;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type DocumentSummary = {
  id: string;
  title: string;
  original_filename: string;
  source_type: string;
  source_url: string | null;
  mime_type: string;
  file_size: number;
  collection_id: string | null;
  layout_type: string;
  layout_override: string | null;
  document_type_override: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  last_read_at: string | null;
  archived_at: string | null;
  cover_url: string;
};

export type DocumentDetail = DocumentSummary & {
  versions: DocumentVersion[];
  processing_jobs: ProcessingJob[];
  processing_result: DocumentProcessingResult | null;
};

export type DocumentProcessingResult = {
  detected_document_type: string;
  effective_document_type: string;
  document_type_override: string | null;
  language: string;
  source_page_count: number;
  chapter_count: number;
  layout_quality: string;
  layout_quality_score: number | null;
  warnings: string[];
};

export type CollectionSummary = {
  id: string;
  name: string;
};

export type Collection = CollectionSummary & {
  document_count: number;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: string;
  name: string;
  created_at: string;
};

export type LibraryDocument = DocumentSummary & {
  collection: CollectionSummary | null;
  tags: Tag[];
  progress_percent: number;
  language: string;
  completed: boolean;
};

export type DocumentList = {
  items: LibraryDocument[];
  total: number;
  limit: number;
  offset: number;
};

export type LibraryQuery = {
  search?: string;
  sort?: "newest" | "recent" | "title" | "progress";
  source_type?: string;
  status?: string;
  collection_id?: string;
  tag_id?: string;
  language?: string;
  completion?: "completed" | "in_progress" | "unread";
  archived?: boolean;
  limit?: number;
  offset?: number;
};

export type DocumentUploadOptions = {
  document_type_override?: string | null;
  collection_id?: string | null;
};

export type ProcessingStatus = {
  document_id: string;
  status: string;
  stage: string;
  progress: number;
  error_code: string | null;
  error_message: string | null;
  page_count: number | null;
  completed_stages: string[];
};

export type TocItem = {
  block_id: string;
  title: string;
  level: number;
  page_number: number;
  sequence_number: number;
};

export type ContentBlock = {
  id: string;
  parent_block_id: string | null;
  sequence_number: number;
  block_type:
    | "HEADING_1"
    | "HEADING_2"
    | "HEADING_3"
    | "PARAGRAPH"
    | "LIST_ITEM"
    | "CODE"
    | "QUOTE"
    | "PAGE_BREAK"
    | "TABLE"
    | "FORMULA"
    | "IMAGE";
  text: string;
  source_text: string;
  display_text: string;
  transformation_log: Array<Record<string, unknown>>;
  transformation_confidence: number;
  needs_review: boolean;
  source_anchor: {
    page_number?: number;
    bounding_box?: number[];
    source_block_ids?: string[];
    source_start_offset?: number;
    source_end_offset?: number;
    [key: string]: unknown;
  };
  semantic_role: string;
  heading_level: number | null;
  keep_with_next: boolean;
  avoid_break_inside: boolean;
  break_before: boolean;
  break_after: boolean;
  indent_level: number;
  text_align: "left" | "right" | "center" | "justify" | "start" | "end";
  is_first_paragraph: boolean;
  is_chapter_opening: boolean;
  caption_for_asset_id: string | null;
  footnote_reference: string | null;
  source_page_number: number;
  page_number: number;
  chapter_index: number | null;
  section_index: number | null;
  paragraph_index: number | null;
  start_offset: number;
  end_offset: number;
  bounding_box: number[];
  font_name: string | null;
  font_size: number | null;
  is_bold: boolean;
  is_italic: boolean;
  confidence: number;
  metadata: Record<string, unknown>;
  content_hash: string;
  created_at: string;
};

export type ContentBlockList = {
  items: ContentBlock[];
  total: number;
  limit: number;
  offset: number;
};

export type SearchResult = {
  query: string;
  items: ContentBlock[];
  total: number;
};

export type ReadingProgress = {
  id: string;
  document_id: string;
  document_version_id: string;
  last_block_id: string | null;
  page_number: number;
  progress_percent: number;
  scroll_offset: number;
  reading_mode: ReadingMode;
  updated_at: string;
};

export type ProgressInput = Omit<
  ReadingProgress,
  "id" | "document_id" | "updated_at"
>;

export type Bookmark = {
  id: string;
  document_id: string;
  document_version_id: string;
  content_block_id: string;
  page_number: number;
  title: string;
  created_at: string;
};

export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";

export type Note = {
  id: string;
  highlight_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type Highlight = {
  id: string;
  document_id: string;
  document_version_id: string;
  content_block_id: string;
  start_offset: number;
  end_offset: number;
  selected_text: string;
  prefix_text: string;
  suffix_text: string;
  color: HighlightColor;
  status: "ACTIVE" | "NEEDS_REVIEW" | "ORPHANED";
  created_at: string;
  updated_at: string;
  note: Note | null;
};

export type ReadingPreferences = {
  id: string | null;
  theme: "light" | "dark" | "sepia";
  font_size: number;
  line_height: number;
  reading_width: number;
  font_family: "sans" | "serif" | "dyslexic";
  focus_mode: boolean;
  reading_mode: ReadingMode;
  reading_room: string;
  page_turn_animation: boolean;
  page_turn_sound: boolean;
  ambient_sound: boolean;
  master_volume: number;
  ambient_volume: number;
  page_turn_volume: number;
  language: "vi" | "en";
  keyword_level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  use_document_type_defaults: boolean;
  analytics_enabled: boolean;
  updated_at: string | null;
};

export type ReadingPreferencesInput = Pick<
  ReadingPreferences,
  "theme" | "font_size" | "line_height" | "reading_width" | "font_family" | "focus_mode"
>;
export type AccountReadingPreferencesInput = Omit<
  ReadingPreferences,
  "id" | "updated_at"
>;

export type KeywordLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type KeywordFeedbackType =
  | "HELPFUL"
  | "NOT_TECHNICAL"
  | "WRONG_MEANING"
  | "TOO_BASIC"
  | "TOO_ADVANCED";

export type KeywordSummary = {
  id: string;
  canonical_name: string;
  slug: string;
  category: string;
  short_definition: string;
  difficulty: KeywordLevel;
  taxonomy_version: string;
};

export type KeywordOccurrence = {
  id: string;
  keyword: KeywordSummary;
  document_id: string;
  document_version_id: string;
  content_block_id: string;
  page_number: number;
  sequence_number: number;
  start_offset: number;
  end_offset: number;
  surface_text: string;
  confidence: number;
  detection_method: "EXACT" | "ALIAS" | "REGEX" | "CONTEXT_RULE";
  is_suppressed: boolean;
};

export type DocumentKeywords = {
  items: KeywordOccurrence[];
  total: number;
  categories: string[];
  taxonomy_version: string | null;
};

export type KeywordDetail = KeywordSummary & {
  aliases: string[];
  explanation: string;
  beginner_explanation: string;
  intermediate_explanation: string;
  advanced_explanation: string;
  related_keywords: KeywordSummary[];
};

export type KeywordPreferences = {
  id: string | null;
  enabled: boolean;
  user_level: KeywordLevel;
  enabled_categories: string[];
  min_confidence: number;
  available_categories: string[];
  updated_at: string | null;
};

export type KeywordPreferencesInput = Omit<
  KeywordPreferences,
  "id" | "available_categories" | "updated_at"
>;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    let message = "The request could not be completed.";
    try {
      const body = (await response.json()) as {
        detail?: string | { code?: string };
      };
      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (body.detail?.code) {
        message = body.detail.code;
      }
    } catch {
      // Keep the generic message when the API does not return JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function uploadDocument(
  file: File,
  options: DocumentUploadOptions = {},
): Promise<DocumentDetail> {
  const formData = new FormData();
  formData.append("file", file);
  if (options.document_type_override) {
    formData.append("document_type_override", options.document_type_override);
  }
  if (options.collection_id) {
    formData.append("collection_id", options.collection_id);
  }
  return apiRequest<DocumentDetail>("/api/documents/upload", {
    method: "POST",
    body: formData,
  });
}

export function importDocumentUrl(
  url: string,
  options: DocumentUploadOptions = {},
): Promise<DocumentDetail> {
  return apiRequest<DocumentDetail>("/api/documents/import-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      document_type_override: options.document_type_override ?? null,
      collection_id: options.collection_id ?? null,
    }),
  });
}

export function fetchDocuments(query: LibraryQuery = {}): Promise<DocumentList> {
  const parameters = new URLSearchParams({
    limit: String(query.limit ?? 50),
    offset: String(query.offset ?? 0),
  });
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && key !== "limit" && key !== "offset") {
      parameters.set(key, String(value));
    }
  }
  return apiRequest<DocumentList>(`/api/documents?${parameters}`);
}

export function documentCoverUrl(documentId: string): string {
  return `${API_URL}/api/documents/${documentId}/cover`;
}

export function fetchCollections(): Promise<Collection[]> {
  return apiRequest<Collection[]>("/api/collections");
}

export function createCollection(name: string): Promise<Collection> {
  return apiRequest<Collection>("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function fetchTags(): Promise<Tag[]> {
  return apiRequest<Tag[]>("/api/tags");
}

export function createTag(name: string): Promise<Tag> {
  return apiRequest<Tag>("/api/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function organizeDocument(
  documentId: string,
  update: {
    collection_id?: string | null;
    tag_ids?: string[];
    archived?: boolean;
  },
): Promise<LibraryDocument> {
  return apiRequest<LibraryDocument>(
    `/api/documents/${documentId}/organization`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    },
  );
}

export function fetchDocument(documentId: string): Promise<DocumentDetail> {
  return apiRequest<DocumentDetail>(`/api/documents/${documentId}`);
}

export function renameDocument(documentId: string, title: string): Promise<DocumentDetail> {
  return apiRequest<DocumentDetail>(`/api/documents/${documentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export function setDocumentTypeOverride(
  documentId: string,
  documentTypeOverride: string | null,
): Promise<DocumentDetail> {
  return apiRequest<DocumentDetail>(`/api/documents/${documentId}/document-type`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_type_override: documentTypeOverride }),
  });
}

export function reprocessDocument(documentId: string): Promise<DocumentDetail> {
  return apiRequest<DocumentDetail>(`/api/documents/${documentId}/reprocess`, {
    method: "POST",
  });
}

export function deleteDocument(documentId: string): Promise<void> {
  return apiRequest<void>(`/api/documents/${documentId}`, { method: "DELETE" });
}

export function fetchProcessingStatus(documentId: string): Promise<ProcessingStatus> {
  return apiRequest<ProcessingStatus>(`/api/documents/${documentId}/processing-status`);
}

export function fetchToc(documentId: string): Promise<{ items: TocItem[] }> {
  return apiRequest<{ items: TocItem[] }>(`/api/documents/${documentId}/toc`);
}

export function fetchBlocks(
  documentId: string,
  limit = 200,
  offset = 0,
): Promise<ContentBlockList> {
  return apiRequest<ContentBlockList>(
    `/api/documents/${documentId}/blocks?limit=${limit}&offset=${offset}`,
  );
}

export function searchDocument(documentId: string, query: string): Promise<SearchResult> {
  const parameters = new URLSearchParams({ q: query, limit: "20" });
  return apiRequest<SearchResult>(`/api/documents/${documentId}/search?${parameters}`);
}

export function originalPdfUrl(documentId: string): string {
  return `${API_URL}/api/documents/${documentId}/original`;
}

export function protectedBlockImageUrl(blockId: string): string {
  return `${API_URL}/api/documents/content-blocks/${blockId}/image`;
}

export function fetchProgress(documentId: string): Promise<ReadingProgress | null> {
  return apiRequest<ReadingProgress | null>(`/api/documents/${documentId}/progress`);
}

export function saveProgress(
  documentId: string,
  progress: ProgressInput,
): Promise<ReadingProgress> {
  return apiRequest<ReadingProgress>(`/api/documents/${documentId}/progress`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(progress),
  });
}

export function fetchBookmarks(documentId: string): Promise<{ items: Bookmark[] }> {
  return apiRequest<{ items: Bookmark[] }>(`/api/documents/${documentId}/bookmarks`);
}

export function createBookmark(
  documentId: string,
  input: { document_version_id: string; content_block_id: string; title?: string },
): Promise<Bookmark> {
  return apiRequest<Bookmark>(`/api/documents/${documentId}/bookmarks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteBookmark(bookmarkId: string): Promise<void> {
  return apiRequest<void>(`/api/bookmarks/${bookmarkId}`, { method: "DELETE" });
}

export function fetchHighlights(documentId: string): Promise<{ items: Highlight[] }> {
  return apiRequest<{ items: Highlight[] }>(`/api/documents/${documentId}/highlights`);
}

export function createHighlight(
  documentId: string,
  input: {
    document_version_id: string;
    content_block_id: string;
    start_offset: number;
    end_offset: number;
    selected_text: string;
    color: HighlightColor;
  },
): Promise<Highlight> {
  return apiRequest<Highlight>(`/api/documents/${documentId}/highlights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateHighlight(
  highlightId: string,
  input: { color?: HighlightColor; status?: Highlight["status"] },
): Promise<Highlight> {
  return apiRequest<Highlight>(`/api/highlights/${highlightId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteHighlight(highlightId: string): Promise<void> {
  return apiRequest<void>(`/api/highlights/${highlightId}`, { method: "DELETE" });
}

export function createNote(highlightId: string, content: string): Promise<Note> {
  return apiRequest<Note>(`/api/highlights/${highlightId}/note`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export function updateNote(noteId: string, content: string): Promise<Note> {
  return apiRequest<Note>(`/api/notes/${noteId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export function deleteNote(noteId: string): Promise<void> {
  return apiRequest<void>(`/api/notes/${noteId}`, { method: "DELETE" });
}

export function fetchReadingPreferences(): Promise<ReadingPreferences> {
  return apiRequest<ReadingPreferences>("/api/users/me/reading-preferences");
}

export function saveReadingPreferences(
  preferences: AccountReadingPreferencesInput,
): Promise<ReadingPreferences> {
  return apiRequest<ReadingPreferences>("/api/users/me/reading-preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
  });
}

export function fetchDocumentKeywords(documentId: string): Promise<DocumentKeywords> {
  return apiRequest<DocumentKeywords>(`/api/documents/${documentId}/keywords`);
}

export function fetchKeywordOccurrences(
  documentId: string,
  keywordId: string,
): Promise<DocumentKeywords> {
  return apiRequest<DocumentKeywords>(
    `/api/documents/${documentId}/keywords/${keywordId}/occurrences`,
  );
}

export function fetchKeywordDetail(keywordId: string): Promise<KeywordDetail> {
  return apiRequest<KeywordDetail>(`/api/keywords/${keywordId}`);
}

export function fetchKeywordPreferences(): Promise<KeywordPreferences> {
  return apiRequest<KeywordPreferences>("/api/users/me/keyword-preferences");
}

export function saveKeywordPreferences(
  preferences: KeywordPreferencesInput,
): Promise<KeywordPreferences> {
  return apiRequest<KeywordPreferences>("/api/users/me/keyword-preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
  });
}

export function createKeywordFeedback(input: {
  document_id: string;
  occurrence_id: string;
  feedback_type: KeywordFeedbackType;
  comment?: string;
}): Promise<{ id: string }> {
  return apiRequest<{ id: string }>("/api/keyword-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

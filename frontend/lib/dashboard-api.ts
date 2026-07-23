import { API_URL, authenticatedFetch } from "./auth-api";

export type DashboardDocument = {
  id: string;
  title: string;
  source_type: string;
  document_type: string;
  created_at: string;
  progress_percent: number;
  last_chapter: string | null;
  last_read_at: string | null;
  status: string;
  processing_status: string | null;
  processing_progress: number;
  cover_url: string;
};

export type DashboardData = {
  continue_reading: DashboardDocument[];
  recent_documents: DashboardDocument[];
  processing_documents: DashboardDocument[];
  completed_documents: DashboardDocument[];
  collections: Array<{
    id: string;
    name: string;
    document_count: number;
  }>;
  recent_bookmarks: Array<{
    id: string;
    document_id: string;
    document_title: string;
    title: string;
    page_number: number;
    created_at: string;
  }>;
  recent_notes: Array<{
    id: string;
    document_id: string;
    document_title: string;
    content: string;
    selected_text: string;
    updated_at: string;
  }>;
  stats: {
    total_documents: number;
    in_progress_documents: number;
    completed_documents: number;
    bookmark_count: number;
    note_count: number;
    analytics_enabled: boolean;
    reading_time_seconds: number;
    reading_streak_days: number;
    source_pages_reached: number;
  };
};

export async function fetchDashboard(): Promise<DashboardData> {
  const response = await authenticatedFetch(`${API_URL}/api/dashboard`);
  if (!response.ok) throw new Error("Dashboard could not be loaded");
  return response.json() as Promise<DashboardData>;
}

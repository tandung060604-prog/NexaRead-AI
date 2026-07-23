import { API_URL, authenticatedFetch } from "./auth-api";

export type ReadingType =
  | "STUDY"
  | "RESEARCH"
  | "WORK"
  | "BOOKS"
  | "TECHNICAL";
export type ReadingGoal =
  | "UNDERSTAND"
  | "REMEMBER"
  | "REFERENCE"
  | "COMPLETE";
export type DisplayPreference = "AUTO" | "BOOK" | "CLEAN" | "STUDY";

export type OnboardingProfile = {
  status: "NOT_STARTED" | "COMPLETED" | "SKIPPED";
  reading_types: ReadingType[];
  reading_goal: ReadingGoal | null;
  display_preference: DisplayPreference | null;
  analytics_enabled: boolean;
  completed_at: string | null;
  skipped_at: string | null;
};

export type OnboardingInput = {
  reading_types: ReadingType[];
  reading_goal: ReadingGoal;
  display_preference: DisplayPreference;
  analytics_enabled: boolean;
};

export type ReadingAnalytics = {
  enabled: boolean;
  total_reading_seconds: number;
  reading_streak_days: number;
  documents_started: number;
  documents_completed: number;
  source_pages_reached: number;
  active_dates: string[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(`Personalization request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function fetchOnboarding(): Promise<OnboardingProfile> {
  return request<OnboardingProfile>("/api/users/me/onboarding");
}

export function saveOnboarding(
  input: OnboardingInput,
): Promise<OnboardingProfile> {
  return request<OnboardingProfile>("/api/users/me/onboarding", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
}

export function skipOnboarding(): Promise<OnboardingProfile> {
  return request<OnboardingProfile>("/api/users/me/onboarding/skip", {
    method: "POST",
  });
}

export function fetchReadingAnalytics(): Promise<ReadingAnalytics> {
  return request<ReadingAnalytics>("/api/users/me/reading-analytics");
}

export function setReadingAnalyticsEnabled(
  enabled: boolean,
): Promise<ReadingAnalytics> {
  return request<ReadingAnalytics>(
    "/api/users/me/reading-analytics/preference",
    {
      body: JSON.stringify({ enabled }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    },
  );
}

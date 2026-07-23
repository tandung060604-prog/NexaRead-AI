import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const CSRF_COOKIE_NAME = "nexaread_csrf";

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
  preferred_locale: string;
  email_verified_at: string | null;
  created_at: string;
  last_login_at: string | null;
};

export type AuthSession = {
  id: string;
  expires_at: string;
  created_at: string;
  last_used_at: string;
  user_agent: string | null;
  current: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function cookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  for (const item of document.cookie.split(";")) {
    const value = item.trim();
    if (value.startsWith(prefix)) {
      return decodeURIComponent(value.slice(prefix.length));
    }
  }
  return null;
}

function isUnsafeMethod(method: string | undefined): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes((method ?? "GET").toUpperCase());
}

export async function authenticatedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (isUnsafeMethod(init.method)) {
    const csrfToken = cookieValue(CSRF_COOKIE_NAME);
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }
  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}

async function parseError(response: Response): Promise<ApiError> {
  let code = "REQUEST_FAILED";
  let message = translate(DEFAULT_LOCALE, "errors", "REQUEST_FAILED");
  try {
    const payload = (await response.json()) as {
      detail?: string | { code?: string };
    };
    if (typeof payload.detail === "string") {
      message = payload.detail;
    } else if (payload.detail?.code) {
      code = payload.detail.code;
    }
  } catch {
    // Keep the safe generic error.
  }
  return new ApiError(message, code, response.status);
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${API_URL}${path}`, init);
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function registerAccount(input: {
  email: string;
  display_name: string;
  password: string;
}): Promise<AuthUser> {
  const response = await authRequest<{ user: AuthUser }>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.user;
}

export async function loginAccount(input: {
  email: string;
  password: string;
}): Promise<AuthUser> {
  const response = await authRequest<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.user;
}

export function fetchCurrentUser(): Promise<AuthUser> {
  return authRequest<AuthUser>("/api/auth/me");
}

export function updatePreferredLocale(
  preferredLocale: "vi" | "en",
): Promise<AuthUser> {
  return authRequest<AuthUser>("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferred_locale: preferredLocale }),
  });
}

export function logoutAccount(): Promise<void> {
  return authRequest<void>("/api/auth/logout", { method: "POST" });
}

export async function fetchAuthSessions(): Promise<AuthSession[]> {
  const response = await authRequest<{ items: AuthSession[] }>("/api/auth/sessions");
  return response.items;
}

export function revokeAuthSession(sessionId: string): Promise<void> {
  return authRequest<void>(`/api/auth/sessions/${sessionId}`, { method: "DELETE" });
}

export function revokeAllAuthSessions(): Promise<void> {
  return authRequest<void>("/api/auth/sessions", { method: "DELETE" });
}

export function friendlyAuthError(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (error instanceof ApiError) {
    const translated = translate(locale, "errors", error.code);
    return translated === `errors.${error.code}` ? error.message : translated;
  }
  return translate(locale, "errors", "UNKNOWN");
}

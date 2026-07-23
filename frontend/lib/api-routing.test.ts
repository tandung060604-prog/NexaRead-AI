import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchDashboard } from "./dashboard-api";
import {
  fetchOnboarding,
  saveOnboarding,
  skipOnboarding,
} from "./personalization-api";

function jsonResponse(payload: object): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

describe("same-origin API routing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("routes onboarding reads and mutations through the Next.js proxy", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(jsonResponse({})));

    await fetchOnboarding();
    await saveOnboarding({
      analytics_enabled: true,
      display_preference: "BOOK",
      reading_goal: "UNDERSTAND",
      reading_types: ["STUDY"],
    });
    await skipOnboarding();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/users/me/onboarding",
      "/api/users/me/onboarding",
      "/api/users/me/onboarding/skip",
    ]);
  });

  it("routes dashboard requests through the same authenticated proxy", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({}));

    await fetchDashboard();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/dashboard");
  });
});

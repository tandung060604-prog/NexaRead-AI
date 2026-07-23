import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  authenticatedFetch,
  friendlyAuthError,
} from "./auth-api";

describe("authenticatedFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.cookie = "nexaread_csrf=; Max-Age=0; path=/";
  });

  it("includes credentials and the CSRF header for mutations", async () => {
    document.cookie = "nexaread_csrf=csrf-token; path=/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await authenticatedFetch("/api/documents/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(init?.credentials).toBe("include");
    expect(headers.get("X-CSRF-Token")).toBe("csrf-token");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("does not add a CSRF header to safe requests", async () => {
    document.cookie = "nexaread_csrf=csrf-token; path=/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );

    await authenticatedFetch("/api/auth/me");

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).has("X-CSRF-Token")).toBe(false);
    expect(init?.credentials).toBe("include");
  });
});

describe("friendlyAuthError", () => {
  it("maps stable backend codes to Vietnamese messages", () => {
    expect(
      friendlyAuthError(
        new ApiError("request failed", "AUTH_INVALID_CREDENTIALS", 401),
      ),
    ).toBe("Email hoặc mật khẩu không đúng.");
  });
});

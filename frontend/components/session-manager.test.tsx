import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAuthSessions: vi.fn(),
  revokeAuthSession: vi.fn(),
  revokeAllAuthSessions: vi.fn(),
}));

vi.mock("@/lib/auth-api", () => ({
  fetchAuthSessions: mocks.fetchAuthSessions,
  revokeAuthSession: mocks.revokeAuthSession,
  revokeAllAuthSessions: mocks.revokeAllAuthSessions,
  friendlyAuthError: () => "Không thể tải phiên đăng nhập.",
}));

import { SessionManager } from "./session-manager";

describe("SessionManager", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists sessions and revokes a selected non-current device", async () => {
    mocks.fetchAuthSessions.mockResolvedValue([
      {
        id: "current",
        expires_at: "2026-08-01T00:00:00Z",
        created_at: "2026-07-23T00:00:00Z",
        last_used_at: "2026-07-23T00:00:00Z",
        user_agent: "Current browser",
        current: true,
      },
      {
        id: "other",
        expires_at: "2026-08-01T00:00:00Z",
        created_at: "2026-07-22T00:00:00Z",
        last_used_at: "2026-07-22T00:00:00Z",
        user_agent: "Other browser",
        current: false,
      },
    ]);
    mocks.revokeAuthSession.mockResolvedValue(undefined);

    render(<SessionManager />);
    expect(await screen.findByText("Other browser")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thu hồi phiên đăng nhập" }));

    await waitFor(() => expect(mocks.revokeAuthSession).toHaveBeenCalledWith("other"));
    await waitFor(() => expect(screen.queryByText("Other browser")).not.toBeInTheDocument());
    expect(screen.getByText("Current browser")).toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchOnboarding: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  saveOnboarding: vi.fn(),
  skipOnboarding: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/lib/personalization-api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/personalization-api")>();
  return {
    ...original,
    fetchOnboarding: mocks.fetchOnboarding,
    saveOnboarding: mocks.saveOnboarding,
    skipOnboarding: mocks.skipOnboarding,
  };
});

import { OnboardingWizard } from "./onboarding-wizard";

const emptyProfile = {
  analytics_enabled: false,
  completed_at: null,
  display_preference: null,
  reading_goal: null,
  reading_types: [],
  skipped_at: null,
  status: "NOT_STARTED",
};

describe("OnboardingWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchOnboarding.mockResolvedValue(emptyProfile);
    mocks.saveOnboarding.mockResolvedValue({
      ...emptyProfile,
      status: "COMPLETED",
    });
    mocks.skipOnboarding.mockResolvedValue({
      ...emptyProfile,
      status: "SKIPPED",
    });
  });

  afterEach(cleanup);

  it("completes the three optional personalization steps", async () => {
    render(<OnboardingWizard />);

    expect(
      await screen.findByRole("heading", {
        name: "Bạn thường đọc loại tài liệu nào?",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Học tập" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Tài liệu kỹ thuật" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Tiếp tục/ }));

    expect(
      screen.getByRole("heading", {
        name: "Mục tiêu đọc chính của bạn là gì?",
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Hiểu sâu nội dung" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Tiếp tục/ }));

    expect(
      screen.getByRole("heading", {
        name: "Bạn thích cách trình bày nào?",
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Sạch và tập trung/ }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Thống kê đọc tối giản/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất" }));

    await waitFor(() => {
      expect(mocks.saveOnboarding).toHaveBeenCalledWith({
        analytics_enabled: true,
        display_preference: "CLEAN",
        reading_goal: "UNDERSTAND",
        reading_types: ["STUDY", "TECHNICAL"],
      });
    });
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("can be skipped without selecting any answers", async () => {
    render(<OnboardingWizard />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Bỏ qua thiết lập" }),
    );

    await waitFor(() => expect(mocks.skipOnboarding).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("does not block an existing profile on the onboarding route", async () => {
    mocks.fetchOnboarding.mockResolvedValue({
      ...emptyProfile,
      status: "SKIPPED",
    });

    render(<OnboardingWizard />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard"),
    );
  });
});

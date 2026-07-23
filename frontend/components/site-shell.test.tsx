import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/i18n";

const state = vi.hoisted(() => ({
  pathname: "/",
  user: null as null | {
    display_name: string;
    email: string;
  },
  replace: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: state.replace, refresh: state.refresh }),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    user: state.user,
    loading: false,
    logout: state.logout,
  }),
}));

import { SiteShell } from "./site-shell";

describe("SiteShell", () => {
  afterEach(() => {
    cleanup();
    state.pathname = "/";
    state.user = null;
    vi.clearAllMocks();
  });

  it("uses a public header instead of the application sidebar on landing", () => {
    render(<SiteShell><p>Landing content</p></SiteShell>);

    expect(screen.getByRole("navigation", { name: "Điều hướng công khai" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Điều hướng chính" })).toBeNull();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Tính năng" })).toHaveAttribute(
      "href",
      "/#features",
    );
    expect(screen.getByRole("link", { name: "Bắt đầu miễn phí" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("opens mobile navigation and switches the public color theme", () => {
    render(<SiteShell><p>Landing content</p></SiteShell>);

    fireEvent.click(screen.getByRole("button", { name: "Mở menu" }));
    expect(screen.getByRole("navigation", {
      name: "Điều hướng công khai trên di động",
    })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đóng menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.click(screen.getAllByRole("button", {
      name: "Chuyển sang giao diện sáng",
    })[0]);
    expect(screen.getByText("Landing content").closest(".public-shell")).toHaveAttribute(
      "data-public-theme",
      "light",
    );
  });

  it("shows account identity and app navigation on protected pages", () => {
    state.pathname = "/library";
    state.user = { display_name: "Nguyễn An", email: "an@example.com" };
    render(<SiteShell><p>Library content</p></SiteShell>);

    expect(screen.getByRole("navigation", { name: "Điều hướng chính" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tài khoản của Nguyễn An" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(
      screen.getByRole("navigation", {
        name: translate("vi", "common", "nav.mobilePrimary"),
      }),
    ).toHaveClass("sm:hidden");
    expect(
      screen.getByRole("link", {
        name: translate("vi", "common", "accessibility.skipToContent"),
      }),
    ).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).not.toHaveClass("w-full");
    expect(screen.getAllByRole("button", { name: "Đăng xuất" })).toHaveLength(2);
  });
});

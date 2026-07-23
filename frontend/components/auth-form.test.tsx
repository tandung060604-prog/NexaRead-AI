import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  setUser: vi.fn(),
  loginAccount: vi.fn(),
  registerAccount: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ setUser: mocks.setUser }),
}));

vi.mock("@/lib/auth-api", () => ({
  loginAccount: mocks.loginAccount,
  registerAccount: mocks.registerAccount,
  friendlyAuthError: () => "Thông tin đăng nhập không hợp lệ.",
}));

import { AuthForm } from "./auth-form";

const user = {
  id: "user-1",
  email: "reader@example.com",
  display_name: "Reader",
  preferred_locale: "vi",
  email_verified_at: null,
  created_at: "2026-07-23T00:00:00Z",
  last_login_at: null,
};

describe("AuthForm", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs in once, prevents double submit, and returns to the library", async () => {
    let resolveLogin: (value: typeof user) => void = () => undefined;
    mocks.loginAccount.mockReturnValue(
      new Promise<typeof user>((resolve) => {
        resolveLogin = resolve;
      }),
    );
    render(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), {
      target: { value: "correct password" },
    });
    const submit = screen.getByRole("button", { name: "Đăng nhập" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(mocks.loginAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Đang xử lý…" })).toBeDisabled();

    await act(async () => resolveLogin(user));
    expect(mocks.setUser).toHaveBeenCalledWith(user);
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("supports password visibility and validates registration length", () => {
    render(<AuthForm mode="register" />);
    const password = screen.getByLabelText("Mật khẩu");
    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Hiện mật khẩu" }));
    expect(password).toHaveAttribute("type", "text");
    fireEvent.change(screen.getByLabelText("Tên hiển thị"), {
      target: { value: "Reader" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.change(password, { target: { value: "short" } });
    fireEvent.submit(screen.getByRole("button", { name: "Tạo tài khoản" }).closest("form")!);

    expect(mocks.registerAccount).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Mật khẩu đăng ký cần ít nhất 10 ký tự.",
    );
  });

  it("opens optional onboarding after a successful registration", async () => {
    mocks.registerAccount.mockResolvedValue(user);
    const { container } = render(<AuthForm mode="register" />);
    fireEvent.change(
      container.querySelector('input[autocomplete="name"]')!,
      { target: { value: "Reader" } },
    );
    fireEvent.change(
      container.querySelector('input[autocomplete="email"]')!,
      { target: { value: "reader@example.com" } },
    );
    fireEvent.change(
      container.querySelector('input[autocomplete="new-password"]')!,
      { target: { value: "a secure password" } },
    );
    fireEvent.submit(container.querySelector("form")!);

    await act(async () => undefined);
    expect(mocks.registerAccount).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
    expect(mocks.refresh).toHaveBeenCalled();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    user: null,
    setUser: vi.fn(),
  }),
}));

import { I18nProvider, useI18n } from "./i18n-provider";
import { LanguageSelector } from "./language-selector";

function LocaleProbe() {
  const { locale, t } = useI18n();
  return <output>{locale}:{t("common", "nav.library")}</output>;
}

describe("I18nProvider", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.lang = "vi";
  });

  it("switches locale and synchronizes the html lang attribute", async () => {
    render(
      <I18nProvider>
        <LanguageSelector />
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByText("vi:Thư viện")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Ngôn ngữ" }), {
      target: { value: "en" },
    });

    expect(await screen.findByText("en:Library")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en");
  });
});

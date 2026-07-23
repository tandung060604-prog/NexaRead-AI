import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { translate } from "@/lib/i18n";

import HomePage from "./page";

afterEach(cleanup);

describe("HomePage", () => {
  it("renders the complete Vietnamese marketing story and product preview", () => {
    render(<HomePage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", {
      name: translate("vi", "landing", "heroTitle"),
    })).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: translate("vi", "landing", "primaryCta"),
      }),
    ).toHaveAttribute("href", "/register");
    expect(screen.getByRole("region", {
      name: translate("vi", "landing", "preview.label"),
    })).toBeInTheDocument();

    for (const key of ["problem", "how", "features", "audience", "privacy", "faq"]) {
      expect(screen.getByRole("heading", {
        name: translate("vi", "landing", `${key}.title`),
      })).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", {
      name: translate("vi", "landing", "finalCta.title"),
    })).toBeInTheDocument();
  });

  it("states current format, privacy, citation, and OCR behavior accurately", () => {
    render(<HomePage />);

    expect(screen.getByText(
      translate("vi", "landing", "faq.items.formats.answer"),
    )).toBeInTheDocument();
    expect(screen.getByText(
      translate("vi", "landing", "faq.items.scan.answer"),
    )).toHaveTextContent("OCR_REQUIRED");
    expect(screen.getByText(
      translate("vi", "landing", "privacy.items.ownership.description"),
    )).toBeInTheDocument();
    expect(screen.queryByText(/huấn luyện|training/i)).not.toBeInTheDocument();
  });
});

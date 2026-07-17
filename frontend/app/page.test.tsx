import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the product name and upload link", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "NexaRead AI" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload a PDF" })).toHaveAttribute(
      "href",
      "/upload",
    );
  });
});

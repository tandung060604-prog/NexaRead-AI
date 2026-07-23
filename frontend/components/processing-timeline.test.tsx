import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { translate } from "@/lib/i18n";

import { PROCESSING_STAGES, ProcessingTimeline } from "./processing-timeline";

afterEach(cleanup);

describe("ProcessingTimeline", () => {
  it("renders the required eight processing stages in order", () => {
    render(
      <ProcessingTimeline
        activeStage="STRUCTURING"
        completedStages={["UPLOADING", "SAFETY_CHECK", "EXTRACTING"]}
        progress={50}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(8);
    expect(items.map((item) => item.textContent?.replace(/^\d+|^✓/, ""))).toEqual(
      PROCESSING_STAGES.map((stage) =>
        translate("vi", "reader", `processingStages.${stage}`),
      ),
    );
    expect(items[3]).toHaveTextContent(
      translate("vi", "reader", "processingStages.STRUCTURING"),
    );
    expect(items[3]).toHaveAttribute("aria-current", "step");
  });
});

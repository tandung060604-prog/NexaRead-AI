import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDialogFocusTrap } from "./dialog-focus";

function DialogFixture({ onEscape }: { onEscape: () => void }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useDialogFocusTrap(open, () => {
    onEscape();
    setOpen(false);
  });
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open dialog
      </button>
      {open ? (
        <div
          aria-label="Test dialog"
          aria-modal="true"
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <button type="button">First action</button>
          <button onClick={() => setOpen(false)} type="button">
            Last action
          </button>
        </div>
      ) : null}
    </>
  );
}

afterEach(cleanup);

describe("useDialogFocusTrap", () => {
  it("traps tab, closes on Escape, and restores the trigger", () => {
    const onEscape = vi.fn();
    render(<DialogFixture onEscape={onEscape} />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();
    fireEvent.click(trigger);

    const first = screen.getByRole("button", { name: "First action" });
    const last = screen.getByRole("button", { name: "Last action" });
    expect(first).toHaveFocus();

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(last, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

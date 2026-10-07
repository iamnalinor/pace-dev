import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { showUndoToast } from "./undo-toast.ts";

describe("showUndoToast", () => {
  it("shows the message with an Undo action that calls back", async () => {
    // sonner captures the pointer for its swipe-to-dismiss; jsdom has no pointer capture.
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    const onUndo = vi.fn();
    render(<Toaster />);
    showUndoToast({ message: "Accepted", onUndo, undoLabel: "Undo" });
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

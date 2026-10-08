import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";

import { HistoryScreen } from "./history-screen.tsx";

describe("HistoryScreen", () => {
  it("shows the board at the chosen instant and every change, newest first, with undo", async () => {
    const { services } = await artboardServices();
    const { user } = renderWithProviders(<HistoryScreen />, { route: "/history", services });
    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    const board = screen.getByRole("region", { name: "Board" });
    expect(within(board).getAllByRole("listitem").length).toBeGreaterThan(0);
    const events = screen.getByRole("region", { name: "Events" });
    const before = within(events).getAllByRole("listitem").length;
    const [firstUndo] = within(events).getAllByRole("button", { name: /^Revoke / });
    if (firstUndo === undefined) {
      throw new Error("no revocable event");
    }
    await user.click(firstUndo);
    // The revocation is recorded as a new change of its own.
    const after = await within(events).findAllByRole("listitem");
    expect(after).toHaveLength(before + 1);
    // Written down when it happened: the second, identical "recorded" time is left out.
    expect(after[0]).not.toHaveTextContent(/recorded/u);
  });

  it("says when a retro entry was written down", async () => {
    const { services } = await artboardServices();
    const at = new Date(Date.parse(services.clock.now()) - 3 * 3_600_000).toISOString();
    await services.actions.captureInbox("Call the dentist", at);
    renderWithProviders(<HistoryScreen />, { route: "/history", services });
    const events = await screen.findByRole("region", { name: "Events" });
    const recorded = within(events)
      .getAllByRole("listitem")
      .filter((item) => item.textContent.includes("recorded"));
    expect(recorded).toHaveLength(1);
  });
});

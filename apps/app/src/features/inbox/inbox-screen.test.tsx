import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { INBOX_CABLE_ID, INBOX_TEXTS } from "@pace/core/testing";

import { InboxScreen } from "./inbox-screen.tsx";

const LONG = `${"A long note about the whole afternoon. ".repeat(20)}END`;

describe("InboxScreen", () => {
  it("clamps a long capture to four lines and opens the whole text under «Show all»", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.actions.captureInbox(LONG);
    await renderScreen(<InboxScreen />, runtime);
    const [clamped] = screen.getAllByText(LONG);
    expect(clamped?.props["numberOfLines"]).toBe(4);
    const showAll = screen.getByRole("button", { name: en("task.showFull") });
    expect(showAll).toBeCollapsed();
    await fireEvent.press(showAll);
    await waitFor(() => {
      expect(screen.getAllByText(LONG)).toHaveLength(2);
    });
  });

  it("offers no «Show all» for a short capture", async () => {
    await renderScreen(<InboxScreen />, await createTestRuntime());
    expect(screen.queryByRole("button", { name: en("task.showFull") })).toBeNull();
  });

  it("says what lands here and offers the line, with no list at all, when nothing waits", async () => {
    await renderScreen(<InboxScreen />, await createTestRuntime({ world: "empty" }));
    expect(await screen.findByText(en("inbox.emptyBody"))).toBeOnTheScreen();
    expect(screen.queryByRole("list")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: en("inbox.openLine") }));
    expect(router.push).toHaveBeenCalledWith("/");
  });

  it("counts what waits under the title and puts «To sort» before the notes", async () => {
    await renderScreen(<InboxScreen />, await createTestRuntime());
    expect(screen.getByText(/waiting$/u)).toBeOnTheScreen();
    const headers = screen.getAllByRole("header").map((node) => node.props["children"] as unknown);
    expect(headers).toEqual(
      expect.arrayContaining([en("inbox.title"), en("review.title"), en("inbox.notes")]),
    );
  });

  it("opens a capture's details on a phone: the whole text, the guess as rows, Accept and Delete", async () => {
    await renderScreen(<InboxScreen />, await createTestRuntime());
    await fireEvent.press(screen.getAllByTestId("inbox-capture")[0] as never);
    expect(await screen.findByRole("header", { name: en("inbox.details") })).toBeOnTheScreen();
    for (const label of [
      "composer.category",
      "composer.project",
      "composer.due",
      "edit.importance",
    ] as const) {
      expect(screen.getByText(en(label))).toBeOnTheScreen();
    }
  });

  it("deletes a capture with a toast that undoes it", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<InboxScreen />, runtime);
    await fireEvent.press(
      screen.getByRole("button", {
        name: `${en("common.delete")}: ${INBOX_TEXTS[INBOX_CABLE_ID]}`,
      }),
    );
    expect(await screen.findByText(en("inbox.deleted"))).toBeOnTheScreen();
    expect(screen.queryByText(INBOX_TEXTS[INBOX_CABLE_ID])).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: en("common.undo") }));
    expect(await screen.findByText(INBOX_TEXTS[INBOX_CABLE_ID])).toBeOnTheScreen();
  });
});

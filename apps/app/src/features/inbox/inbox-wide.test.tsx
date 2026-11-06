import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { INBOX_CABLE_ID, INBOX_TEXTS } from "@pace/core/testing";

import { InboxScreen } from "./inbox-screen.tsx";

// A computer's window: the list with its details beside it.
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => true,
}));

const pane = () => screen.queryByLabelText(en("inbox.details"));

describe("InboxScreen on a wide window", () => {
  it("opens a capture in the inspector, collapsed while nothing is selected, and closes it once accepted", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<InboxScreen />, runtime);
    expect(pane()).toBeNull();
    const [row] = screen.getAllByTestId("inbox-capture");
    await fireEvent.press(row as never);
    expect(await screen.findByRole("header", { name: en("inbox.details") })).toBeOnTheScreen();
    expect(pane()).toBeOnTheScreen();
    expect(row).toHaveProp("aria-current", "page");
    await fireEvent.press(screen.getByRole("button", { name: en("common.accept") }));
    await waitFor(() => {
      expect(screen.queryByRole("header", { name: en("inbox.details") })).toBeNull();
    });
    expect(screen.queryByText(INBOX_TEXTS[INBOX_CABLE_ID])).toBeNull();
  });
});

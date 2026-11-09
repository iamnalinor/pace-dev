import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { paramsSet, searchParams, setSearchParams } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { INBOX_CABLE_ID, INBOX_TEXTS } from "@pace/core/testing";

import { InboxScreen } from "./inbox-screen.tsx";

// A computer's window: the list with its details beside it.
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => true,
}));

const pane = () => screen.queryByLabelText(en("inbox.details"));

/** The shortcuts registered while mounted, by key: the web build's keyboard, as a test drives it. */
const mockHotkeys = new Map<string, () => void>();
jest.mock("#app/ui/use-hotkey.tsx", (): unknown => ({
  ...jest.requireActual("#app/ui/use-hotkey.tsx"),
  useHotkey: (hotkey: undefined | { readonly key: string }, onPress: () => void) => {
    if (hotkey !== undefined) {
      mockHotkeys.set(hotkey.key, onPress);
    }
  },
}));

/** Escape, as the web build's keyboard hands it to the shortcut registered last. */
const pressEscape = async (): Promise<void> => {
  await act(() => {
    mockHotkeys.get("Escape")?.();
  });
};

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

  it("keeps what is open in the address: a reload opens it again (feedback 5 item 6)", async () => {
    const runtime = await createTestRuntime();
    const page = await renderScreen(<InboxScreen />, runtime);
    const [row] = screen.getAllByTestId("inbox-capture");
    await fireEvent.press(row as never);
    const { open } = searchParams();
    expect(open).toBeDefined();
    await page.unmount();
    await renderScreen(<InboxScreen />, runtime);
    expect(screen.getByRole("header", { name: en("inbox.details") })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("common.close") }));
    expect(searchParams()).toEqual({});
  });

  it("leaves the details closed for an entry it does not hold, writing nothing back", async () => {
    setSearchParams({ open: "gone" });
    await renderScreen(<InboxScreen />, await createTestRuntime());
    expect(pane()).toBeNull();
    expect(paramsSet).not.toHaveBeenCalled();
  });

  it("closes the details on Escape (UI review I4)", async () => {
    await renderScreen(<InboxScreen />, await createTestRuntime());
    const [row] = screen.getAllByTestId("inbox-capture");
    await fireEvent.press(row as never);
    expect(pane()).toBeOnTheScreen();
    await pressEscape();
    await waitFor(() => {
      expect(pane()).toBeNull();
    });
    expect(searchParams()).toEqual({});
  });
});

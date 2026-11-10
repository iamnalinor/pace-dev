import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";

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

/** The browser's history steps the screen takes, and the steps it takes back (the web build's). */
const mockHistory = { back: [] as string[], steps: 0 };
jest.mock("#app/platform/push-entry.ts", (): unknown => ({
  usePushEntry: () => () => {
    mockHistory.steps += 1;
  },
  useStepBack: () => (name: string) => {
    mockHistory.back.push(name);
    return false;
  },
}));

beforeEach(() => {
  mockHistory.back.length = 0;
  mockHistory.steps = 0;
});

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

  it("takes the open note off the address without a step once it is accepted or deleted (review I2)", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<InboxScreen />, runtime);
    for (const action of [en("common.accept"), en("common.delete")]) {
      const [row] = screen.getAllByTestId("inbox-capture");
      await fireEvent.press(row as never);
      expect(searchParams()["open"]).toBeDefined();
      const steps = mockHistory.steps;
      await fireEvent.press(within(pane() as never).getByRole("button", { name: action }));
      await waitFor(() => {
        expect(searchParams()).toEqual({});
      });
      // No step of its own: the one that opened it is taken back where it can be.
      expect(mockHistory.steps).toBe(steps);
      expect(mockHistory.back.at(-1)).toBe("open");
    }
    // The row's own Accept, on the note open beside the list, does the same.
    const [row] = screen.getAllByTestId("inbox-capture");
    await fireEvent.press(row as never);
    const steps = mockHistory.steps;
    const [accept] = screen.getAllByRole("button", { name: /^Accept: /u });
    await fireEvent.press(accept as never);
    await waitFor(() => {
      expect(searchParams()).toEqual({});
    });
    expect(mockHistory.steps).toBe(steps);
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

  it("puts Accept and Delete side by side, so a capture is a row's height, not a tower (R25-17)", async () => {
    await renderScreen(<InboxScreen />, await createTestRuntime());
    const [actions] = screen.getAllByTestId("capture-actions");
    expect(String(actions?.props["className"]).split(" ")).toContain("flex-row");
  });
});

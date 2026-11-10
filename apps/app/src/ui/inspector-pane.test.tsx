import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Inspector } from "./shell-regions.tsx";

// A computer's window, where the inspector is drawn.
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => true,
}));

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

/** Each time the pane says it opened or closed, for where focus goes. */
const mockPaneFocus = jest.fn<undefined, [boolean]>();
jest.mock("#app/platform/pane-focus.ts", (): unknown => ({
  usePaneFocus: (_ref: unknown, isShown: boolean) => {
    mockPaneFocus(isShown);
  },
}));

beforeEach(() => {
  mockHotkeys.clear();
  mockPaneFocus.mockClear();
});

describe("Inspector: every pane closes on Escape and takes the focus (UI review I4)", () => {
  it("closes on Escape while open", async () => {
    const onClose = jest.fn();
    await render(
      <Inspector
        inspector={<Text>Details</Text>}
        inspectorLabel="Details pane"
        inspectorOpen
        onInspectorClose={onClose}
      />,
    );
    expect(screen.getByLabelText("Details pane")).toBeOnTheScreen();
    await act(() => {
      mockHotkeys.get("Escape")?.();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves the focus in on open and hands it back on close", async () => {
    const view = await render(
      <Inspector
        inspector={<Text>Details</Text>}
        inspectorLabel="Pane"
        inspectorOpen
        onInspectorClose={jest.fn()}
      />,
    );
    expect(mockPaneFocus).toHaveBeenLastCalledWith(true);
    await view.rerender(
      <Inspector
        inspector={undefined}
        inspectorLabel="Pane"
        inspectorOpen={false}
        onInspectorClose={jest.fn()}
      />,
    );
    expect(mockPaneFocus).toHaveBeenLastCalledWith(false);
  });

  it("registers no Escape while closed", async () => {
    await render(<Inspector inspectorLabel="Pane" onInspectorClose={jest.fn()} />);
    expect(mockHotkeys.has("Escape")).toBe(false);
  });
});

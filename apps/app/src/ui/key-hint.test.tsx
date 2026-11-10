import { render, screen } from "@testing-library/react-native";

import { KeyHint } from "./button.tsx";
import { HOTKEYS } from "./hotkeys.ts";

/** A computer with a keyboard (the web build's fine pointer). */
jest.mock("./use-hotkey.tsx", (): unknown => ({
  ...jest.requireActual("./use-hotkey.tsx"),
  KEYBOARD: "other",
}));

/** The window the hint is shown in. */
const mockWindow = { isWide: true };
jest.mock("./layout.ts", (): unknown => ({
  ...jest.requireActual("./layout.ts"),
  useIsWide: () => mockWindow.isWide,
}));

describe("KeyHint (a button's shortcut)", () => {
  it("names the shortcut on a wide window with a keyboard", async () => {
    mockWindow.isWide = true;
    await render(<KeyHint hotkey={HOTKEYS.primary} variant="primary" />);
    expect(screen.getByText(/Enter/u, { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it("says nothing on a phone-width window: the hint squeezed the label into one letter a line (route sweep)", async () => {
    mockWindow.isWide = false;
    await render(<KeyHint hotkey={HOTKEYS.primary} variant="primary" />);
    expect(screen.queryByText(/Enter/u, { includeHiddenElements: true })).toBeNull();
  });
});

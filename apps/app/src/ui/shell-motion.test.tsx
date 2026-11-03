import { act, fireEvent, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { withWindowWidth } from "#app/test/window.ts";

import { Shell } from "./shell.tsx";

/** The animations started, with the callbacks that finish them (the test decides when). */
const mockTimings: {
  readonly to: number;
  readonly done: ((isFinished: boolean) => void) | undefined;
}[] = [];

jest.mock("react-native-reanimated", (): unknown => {
  // The Jest mock of reanimated (jest.setup.ts), its timing replaced: the test finishes it.
  const actual = jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock");
  return {
    ...actual,
    __esModule: true,
    withTiming: (to: number, _config: unknown, done?: (isFinished: boolean) => void) => {
      mockTimings.push({ done, to });
      return to;
    },
  };
});

jest.mock("react-native-safe-area-context", (): unknown => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ bottom: 0, left: 30, right: 20, top: 0 }),
}));

/** A screen that picks and lets go, as Week does. */
const Picking = () => {
  const [picked, setPicked] = useState<null | string>(null);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setPicked(picked === null ? "Seminar" : null);
        }}
      >
        <Text>Toggle</Text>
      </Pressable>
      {shellOf(picked)}
    </>
  );
};

const shellOf = (picked: null | string) => (
  <Shell
    content={<Text>Grid</Text>}
    inspector={picked === null ? undefined : <Text>{picked}</Text>}
    inspectorLabel="Details"
    inspectorOpen={picked !== null}
  />
);

describe("Shell motion and insets (spec §6 row → inspector, §3.3)", () => {
  withWindowWidth(1440);

  it("slides the inspector out keeping its last content until the exit has finished", async () => {
    await renderScreen(<Picking />, await createTestRuntime({ world: "empty" }));
    await fireEvent.press(screen.getByRole("button", { name: "Toggle" }));
    expect(screen.getByText("Seminar")).toBeOnTheScreen();
    expect(mockTimings.at(-1)?.to).toBe(1);
    await fireEvent.press(screen.getByRole("button", { name: "Toggle" }));
    // Nothing picked any more, yet the pane still shows what it held while it leaves.
    expect(screen.getByText("Seminar")).toBeOnTheScreen();
    await act(() => {
      mockTimings.at(-1)?.done?.(true);
    });
    expect(screen.queryByLabelText("Details")).toBeNull();
    expect(screen.queryByText("Seminar")).toBeNull();
  });

  it("keeps the cutout and the gesture area clear: the left inset before the navigation, the right after the content", async () => {
    await renderScreen(shellOf(null), await createTestRuntime({ world: "empty" }));
    expect(screen.getByTestId("shell")).toHaveStyle({ paddingLeft: 30, paddingRight: 20 });
  });
});

import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { haptic } from "../platform/haptics.ts";
import { CheckCircle } from "./check-circle.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

jest.mock("../platform/haptics.ts", () => ({ haptic: jest.fn() }));

const NOTHING = (): void => undefined;

const circleClasses = (): readonly string[] =>
  String(screen.getByTestId("check-circle").props["className"]).split(" ");

/** A responder event as React Native sends it when a finger lands. */
const touch = (registrationName: string) => ({
  currentTarget: { measure: jest.fn() },
  dispatchConfig: { registrationName },
  nativeEvent: {
    changedTouches: [],
    identifier: 0,
    locationX: 0,
    locationY: 0,
    pageX: 0,
    pageY: 0,
    target: 0,
    timestamp: Date.now(),
    touches: [],
  },
  persist: jest.fn(),
});

describe("CheckCircle (spec §4.2.5)", () => {
  beforeEach(() => {
    jest.mocked(haptic).mockClear();
  });

  it("is a checkbox in the 48 target with the 24 circle inside, no negative margin (F-AND-01)", async () => {
    await render(
      <ThemeProvider>
        <CheckCircle label="Mark done: Essay" onPress={NOTHING} />
      </ThemeProvider>,
    );
    const box = screen.getByRole("checkbox", { name: "Mark done: Essay" });
    expect(box).not.toBeChecked();
    const target = String(box.props["className"]).split(" ");
    expect(target).toEqual(expect.arrayContaining(["min-h-hit", "min-w-hit"]));
    expect(target.some((name) => name.startsWith("-m"))).toBe(false);
    expect(circleClasses()).toEqual(expect.arrayContaining(["size-6", "border-outline"]));
  });

  it("fills with the accent on press-in, before the press lands (F-MOT-01)", async () => {
    await render(
      <ThemeProvider>
        <CheckCircle label="Mark done: Essay" onPress={NOTHING} />
      </ThemeProvider>,
    );
    jest.useFakeTimers();
    try {
      await fireEvent(screen.getByRole("checkbox"), "responderGrant", touch("onResponderGrant"));
      expect(circleClasses()).toContain("bg-accent");
    } finally {
      await act(async () => {
        await jest.runOnlyPendingTimersAsync();
      });
      jest.useRealTimers();
    }
  });

  it("checks with the confirm haptic", async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider>
        <CheckCircle label="Mark done: Essay" onPress={onPress} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole("checkbox"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("confirm");
  });

  it("is a neutral secondary disc when checked at rest: a Done list is no column of accent", async () => {
    await render(
      <ThemeProvider>
        <CheckCircle checked label="Done: Essay" onPress={NOTHING} />
      </ThemeProvider>,
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(circleClasses()).toContain("bg-label-secondary");
    expect(circleClasses()).not.toContain("bg-accent");
  });

  it("is a read-only quaternary ring and no control without a press (History's snapshot)", async () => {
    await render(
      <ThemeProvider>
        <CheckCircle checked label="Done: Essay" />
      </ThemeProvider>,
    );
    const box = screen.getByRole("checkbox", { name: "Done: Essay" });
    expect(box).toBeDisabled();
    expect(circleClasses()).toContain("border-label-quaternary");
  });
});

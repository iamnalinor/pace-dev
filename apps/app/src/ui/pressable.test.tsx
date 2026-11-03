import type { ReactElement } from "react";

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform, processColor, Text } from "react-native";

import { color } from "@pace/core";

import { haptic } from "../platform/haptics.ts";
import { Pressable } from "./pressable.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

jest.mock("../platform/haptics.ts", () => ({ haptic: jest.fn() }));

const playHaptic = jest.mocked(haptic);

/** React Native's minimum press (Pressability's DEFAULT_MIN_PRESS_DURATION). */
const PRESS_MIN_MS = 130;

/** A responder event as React Native sends it when a finger lands or lifts. */
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

const renderLight = async (ui: ReactElement) =>
  await render(<ThemeProvider forced="light">{ui}</ThemeProvider>);

describe("Pressable (the kit's state layer, spec §3.7)", () => {
  beforeEach(() => {
    playHaptic.mockClear();
  });

  it("is pressed between the finger landing and lifting, for a child that draws its own pressed look", async () => {
    await renderLight(
      <Pressable label="Check" onPress={jest.fn()} role="button">
        {({ pressed }) => <Text>{pressed ? "down" : "up"}</Text>}
      </Pressable>,
    );
    const button = screen.getByRole("button", { name: "Check" });
    expect(screen.getByText("up")).toBeOnTheScreen();
    jest.useFakeTimers();
    try {
      await fireEvent(button, "responderGrant", touch("onResponderGrant"));
      // Press-in at once: nothing waits before the pressed look.
      expect(screen.getByText("down")).toBeOnTheScreen();
      await fireEvent(button, "responderRelease", touch("onResponderRelease"));
      // React Native holds a press at least 130 ms before press-out.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(PRESS_MIN_MS);
      });
      expect(screen.getByText("up")).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it("presses through to onPress", async () => {
    const onPress = jest.fn();
    await renderLight(
      <Pressable onPress={onPress} role="button">
        <Text>Save</Text>
      </Pressable>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("hands the press event on (a link reads its modifier keys: Ctrl-click opens a new tab)", async () => {
    const onPress = jest.fn();
    await renderLight(
      <Pressable onPress={onPress} role="link">
        <Text>Week</Text>
      </Pressable>,
    );
    const event = { ctrlKey: true };
    await fireEvent.press(screen.getByRole("link", { name: "Week" }), event);
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining(event));
  });

  it("blocks presses while disabled and says so to screen readers", async () => {
    const onPress = jest.fn();
    await renderLight(
      <Pressable disabled onPress={onPress} role="button">
        <Text>Save</Text>
      </Pressable>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    expect(button.props["accessibilityState"]).toMatchObject({ disabled: true });
  });

  it("says selected to screen readers", async () => {
    await renderLight(
      <>
        <Pressable onPress={jest.fn()} role="tab" selected>
          <Text>Today</Text>
        </Pressable>
        <Pressable onPress={jest.fn()} role="tab">
          <Text>Week</Text>
        </Pressable>
      </>,
    );
    expect(screen.getByRole("tab", { name: "Today" })).toBeSelected();
    expect(screen.getByRole("tab", { name: "Week" })).not.toBeSelected();
  });

  it("ripples on Android in fill.3, drawn by the platform over the content, bounded by default", async () => {
    const restore = jest.replaceProperty(Platform, "OS", "android");
    try {
      await renderLight(
        <>
          <Pressable onPress={jest.fn()} role="button">
            <Text>Bounded</Text>
          </Pressable>
          <Pressable label="Close" onPress={jest.fn()} ripple="borderless" role="button" />
        </>,
      );
      const bounded = screen.getByRole("button", { name: "Bounded" });
      const borderless = screen.getByRole("button", { name: "Close" });
      const fill3 = processColor(color("light", "fill.3"));
      expect(bounded.props["nativeForegroundAndroid"]).toMatchObject({
        borderless: false,
        color: fill3,
        type: "RippleAndroid",
      });
      expect(borderless.props["nativeForegroundAndroid"]).toMatchObject({
        borderless: true,
        color: fill3,
      });
    } finally {
      restore.restore();
    }
  });

  it("plays its haptic once per press, not on press-in", async () => {
    await renderLight(
      <Pressable haptic="confirm" onPress={jest.fn()} role="checkbox">
        <Text>Done</Text>
      </Pressable>,
    );
    const check = screen.getByRole("checkbox", { name: "Done" });
    await fireEvent(check, "responderGrant", touch("onResponderGrant"));
    expect(playHaptic).not.toHaveBeenCalled();
    await fireEvent.press(check);
    expect(playHaptic).toHaveBeenCalledTimes(1);
    expect(playHaptic).toHaveBeenCalledWith("confirm");
  });

  it("plays the long-press haptic on the long press only", async () => {
    const onLongPress = jest.fn();
    await renderLight(
      <Pressable haptic="longPress" onLongPress={onLongPress} onPress={jest.fn()} role="button">
        <Text>Menu</Text>
      </Pressable>,
    );
    const button = screen.getByRole("button", { name: "Menu" });
    await fireEvent.press(button);
    expect(playHaptic).not.toHaveBeenCalled();
    await act(async () => {
      await fireEvent(button, "longPress");
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(playHaptic).toHaveBeenCalledWith("longPress");
  });

  it("plays nothing when disabled", async () => {
    await renderLight(
      <Pressable disabled haptic="confirm" onPress={jest.fn()} role="checkbox">
        <Text>Done</Text>
      </Pressable>,
    );
    await fireEvent.press(screen.getByRole("checkbox", { name: "Done" }));
    expect(playHaptic).not.toHaveBeenCalled();
  });

  it("never shrinks in a row (controls do not yield, spec §4.1.2)", async () => {
    await renderLight(
      <Pressable className="rounded-md" onPress={jest.fn()} role="button">
        <Text>Save</Text>
      </Pressable>,
    );
    const classes = String(screen.getByRole("button", { name: "Save" }).props["className"]);
    expect(classes.split(" ")).toEqual(expect.arrayContaining(["shrink-0", "rounded-md"]));
  });

  it("is at least the 48 dp target on a phone (size.hit), whatever it draws", async () => {
    await renderLight(
      <Pressable className="h-10" onPress={jest.fn()} role="link">
        <Text>Week</Text>
      </Pressable>,
    );
    const classes = String(screen.getByRole("link", { name: "Week" }).props["className"]);
    expect(classes.split(" ")).toEqual(expect.arrayContaining(["min-h-hit", "min-w-hit", "h-10"]));
  });

  it("says checked to screen readers on a checkbox, a radio and a switch, never selected", async () => {
    await renderLight(
      <>
        <Pressable checked onPress={jest.fn()} role="checkbox">
          <Text>Done</Text>
        </Pressable>
        <Pressable checked={false} onPress={jest.fn()} role="radio">
          <Text>Other</Text>
        </Pressable>
        <Pressable checked onPress={jest.fn()} role="switch">
          <Text>Night</Text>
        </Pressable>
      </>,
    );
    const done = screen.getByRole("checkbox", { name: "Done" });
    expect(done).toBeChecked();
    expect(done).not.toBeSelected();
    expect(done.props["aria-selected"]).toBeUndefined();
    expect(screen.getByRole("radio", { name: "Other" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Night" })).toBeChecked();
  });

  it("drops selected on a role it does not belong to, even past the type", async () => {
    const loose = { role: "checkbox", selected: true } as unknown as {
      role: "tab";
      selected: boolean;
    };
    await renderLight(
      <Pressable {...loose} onPress={jest.fn()}>
        <Text>Done</Text>
      </Pressable>,
    );
    const done = screen.getByRole("checkbox", { name: "Done" });
    expect(done).not.toBeSelected();
    expect(done.props["aria-selected"]).toBeUndefined();
  });

  it("types selected for tabs and checked for checkables only", () => {
    const typed = [
      <Pressable key="tab" role="tab" selected />,
      <Pressable checked key="checkbox" role="checkbox" />,
      // @ts-expect-error -- a button is neither selected nor checked
      <Pressable key="button" role="button" selected />,
      // @ts-expect-error -- a checkbox is checked, not selected
      <Pressable key="checkbox-selected" role="checkbox" selected />,
      // @ts-expect-error -- a tab is selected, not checked
      <Pressable checked key="tab-checked" role="tab" />,
    ];
    expect(typed).toHaveLength(5);
  });

  it("ripples and plays nothing when it has nothing to do", async () => {
    const restore = jest.replaceProperty(Platform, "OS", "android");
    try {
      await renderLight(
        <Pressable haptic="confirm" role="button">
          <Text>Idle</Text>
        </Pressable>,
      );
      const idle = screen.getByRole("button", { name: "Idle" });
      expect(idle.props["nativeForegroundAndroid"]).toBeUndefined();
      await fireEvent.press(idle);
      expect(playHaptic).not.toHaveBeenCalled();
    } finally {
      restore.restore();
    }
  });
});

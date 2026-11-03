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
});

import type { ComponentProps } from "react";

import { fireEvent, render, screen } from "@testing-library/react-native";
import * as ReactNative from "react-native";

import { haptic } from "../platform/haptics.ts";
import { Pressable } from "./pressable.web.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

jest.mock("../platform/haptics.ts", () => ({ haptic: jest.fn() }));

/** React Native's props plus react-native-web's press-in delay, which React Native's types lack. */
type NativePressableProps = ComponentProps<typeof ReactNative.Pressable> & {
  readonly delayPressIn?: number;
};

/** The props the web Pressable hands to react-native-web's; the real one still draws. */
const mockSeen: NativePressableProps[] = [];

jest.mock("react-native/Libraries/Components/Pressable/Pressable", () => {
  const actual = jest.requireActual<{ default: typeof ReactNative.Pressable }>(
    "react-native/Libraries/Components/Pressable/Pressable",
  );
  const Recording = (props: NativePressableProps) => {
    mockSeen.push(props);
    return <actual.default {...props} />;
  };
  return { __esModule: true, default: Recording };
});

describe("Pressable on the web", () => {
  beforeEach(() => {
    mockSeen.length = 0;
    jest.mocked(haptic).mockClear();
  });

  it("starts pressing at once: react-native-web otherwise waits 50 ms before press-in", async () => {
    await render(
      <ThemeProvider forced="light">
        <Pressable onPress={jest.fn()} role="button">
          <ReactNative.Text>Save</ReactNative.Text>
        </Pressable>
      </ThemeProvider>,
    );
    expect(mockSeen.at(-1)?.delayPressIn).toBe(0);
  });

  it("carries the state-layer mark global.css draws hover, pressed and the focus-visible ring on", async () => {
    await render(
      <ThemeProvider forced="light">
        <Pressable onPress={jest.fn()} role="button">
          <ReactNative.Text>Bounded</ReactNative.Text>
        </Pressable>
        <Pressable label="Close" onPress={jest.fn()} ripple="borderless" role="button" />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: "Bounded" }).props["dataSet"]).toEqual({
      pacePress: "bounded",
    });
    expect(screen.getByRole("button", { name: "Close" }).props["dataSet"]).toEqual({
      pacePress: "borderless",
    });
  });

  it("has no NativeWind active: state: the pressed overlay is CSS, never a React render", async () => {
    await render(
      <ThemeProvider forced="light">
        <Pressable className="rounded-md" onPress={jest.fn()} role="button">
          <ReactNative.Text>Save</ReactNative.Text>
        </Pressable>
      </ThemeProvider>,
    );
    const classes = String(screen.getByRole("button", { name: "Save" }).props["className"]);
    expect(classes).not.toContain("active:");
    expect(classes.split(" ")).toEqual(expect.arrayContaining(["shrink-0", "rounded-md"]));
  });

  it("keeps the press, disabled and selected behaviour of the phone", async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider forced="light">
        <Pressable haptic="confirm" onPress={onPress} role="tab" selected>
          <ReactNative.Text>Today</ReactNative.Text>
        </Pressable>
        <Pressable disabled onPress={onPress} role="tab">
          <ReactNative.Text>Week</ReactNative.Text>
        </Pressable>
      </ThemeProvider>,
    );
    const today = screen.getByRole("tab", { name: "Today" });
    const week = screen.getByRole("tab", { name: "Week" });
    expect(today).toBeSelected();
    // react-native-web reads no accessibilityState: the browser needs the aria attribute.
    expect(mockSeen.find((props) => props["aria-selected"] === true)).toBeDefined();
    expect(week).toBeDisabled();
    await fireEvent.press(week);
    expect(onPress).not.toHaveBeenCalled();
    await fireEvent.press(today);
    expect(onPress).toHaveBeenCalledTimes(1);
    // The port itself is silent in a browser (haptics.web.ts); the press still asks for it.
    expect(jest.mocked(haptic)).toHaveBeenCalledWith("confirm");
  });
});

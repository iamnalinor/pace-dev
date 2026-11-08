import type { ComponentProps } from "react";

import { fireEvent, render, screen } from "@testing-library/react-native";
import * as ReactNative from "react-native";

import { haptic } from "../platform/haptics.ts";
import { Pressable } from "./pressable.web.tsx";
import { spacePress } from "./space-press.web.ts";
import { ThemeProvider } from "./theme-provider.tsx";

jest.mock("../platform/haptics.ts", () => ({ haptic: jest.fn() }));

/** React Native's props plus react-native-web's press-in delay and key handler, which its types lack. */
type NativePressableProps = ComponentProps<typeof ReactNative.Pressable> & {
  readonly delayPressIn?: number;
  readonly onKeyDown?: (event: never) => void;
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

/** The props of the last Pressable drawn: a test draws one, so they are that element's. */
const lastProps = (): NativePressableProps => {
  const props = mockSeen.at(-1);
  if (props === undefined) {
    throw new Error("no Pressable was drawn");
  }
  return props;
};

/** A Space keydown aimed at the control itself, which remembers being prevented as React's does. */
const space = () => {
  const target = {};
  let isPrevented = false;
  return {
    currentTarget: target,
    isDefaultPrevented: () => isPrevented,
    key: " ",
    preventDefault: jest.fn(() => {
      isPrevented = true;
    }),
    repeat: false,
    target,
  };
};

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

  it("is at least the 44 px target on the web (size.hitWeb), whatever it draws", async () => {
    await render(
      <ThemeProvider forced="light">
        <Pressable className="h-10" onPress={jest.fn()} role="link">
          <ReactNative.Text>Week</ReactNative.Text>
        </Pressable>
      </ThemeProvider>,
    );
    const classes = String(screen.getByRole("link", { name: "Week" }).props["className"]);
    expect(classes.split(" ")).toEqual(
      expect.arrayContaining(["min-h-hit-web", "min-w-hit-web", "h-10"]),
    );
  });

  it("is exactly its drawn box on the web too with hitArea drawn", async () => {
    await render(
      <ThemeProvider forced="light">
        <Pressable className="h-6" hitArea="drawn" onPress={jest.fn()} role="button">
          <ReactNative.Text>Lecture</ReactNative.Text>
        </Pressable>
      </ThemeProvider>,
    );
    const classes = String(screen.getByRole("button", { name: "Lecture" }).props["className"]);
    expect(classes.split(" ")).not.toContain("min-h-hit-web");
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
    expect(week).toBeDisabled();
    await fireEvent.press(week);
    expect(onPress).not.toHaveBeenCalled();
    await fireEvent.press(today);
    expect(onPress).toHaveBeenCalledTimes(1);
    // The port itself is silent in a browser (haptics.web.ts); the press still asks for it.
    expect(jest.mocked(haptic)).toHaveBeenCalledWith("confirm");
  });

  it("hands react-native-web aria-selected for the selected tab itself", async () => {
    await render(
      <ThemeProvider forced="light">
        <Pressable onPress={jest.fn()} role="tab" selected>
          <ReactNative.Text>Today</ReactNative.Text>
        </Pressable>
      </ThemeProvider>,
    );
    // react-native-web reads no accessibilityState: the browser needs the aria attribute.
    expect(lastProps()["aria-selected"]).toBe(true);
    expect(lastProps()["aria-checked"]).toBeUndefined();
  });

  it("hands a checkbox aria-checked and no aria-selected", async () => {
    await render(
      <ThemeProvider forced="light">
        <Pressable checked onPress={jest.fn()} role="checkbox">
          <ReactNative.Text>Done</ReactNative.Text>
        </Pressable>
      </ThemeProvider>,
    );
    expect(lastProps()["aria-checked"]).toBe(true);
    expect(lastProps()["aria-selected"]).toBeUndefined();
    expect(screen.getByRole("checkbox", { name: "Done" })).toBeChecked();
  });

  describe("Space (bug-lessons class 113: Pressable owns it)", () => {
    it.each(["checkbox", "radio", "switch", "tab"] as const)(
      "presses a %s once per Space, not per repeat, and keeps the page still",
      async (role) => {
        const onPress = jest.fn();
        await render(
          <ThemeProvider forced="light">
            <Pressable onPress={onPress} role={role}>
              <ReactNative.Text>Item</ReactNative.Text>
            </Pressable>
          </ThemeProvider>,
        );
        const event = space();
        lastProps().onKeyDown?.(event as never);
        lastProps().onKeyDown?.({ ...space(), repeat: true } as never);
        expect(onPress).toHaveBeenCalledTimes(1);
        expect(event.preventDefault).toHaveBeenCalled();
      },
    );

    it("leaves a button's Space to react-native-web, which presses it already", async () => {
      const onPress = jest.fn();
      await render(
        <ThemeProvider forced="light">
          <Pressable onPress={onPress} role="button">
            <ReactNative.Text>Save</ReactNative.Text>
          </Pressable>
        </ThemeProvider>,
      );
      lastProps().onKeyDown?.(space() as never);
      expect(onPress).not.toHaveBeenCalled();
    });

    it("gives a disabled control no action", async () => {
      const onPress = jest.fn();
      await render(
        <ThemeProvider forced="light">
          <Pressable disabled onPress={onPress} role="switch">
            <ReactNative.Text>Night</ReactNative.Text>
          </Pressable>
        </ThemeProvider>,
      );
      lastProps().onKeyDown?.(space() as never);
      expect(onPress).not.toHaveBeenCalled();
    });

    it("presses once when a caller presses on Space without preventing the default (3.1 re-review)", async () => {
      const onPress = jest.fn();
      const keys = {
        onKeyDown: (event: { readonly key: string }) => {
          if (event.key === " ") {
            onPress();
          }
        },
      };
      await render(
        <ThemeProvider forced="light">
          <Pressable {...keys} onPress={onPress} role="checkbox">
            <ReactNative.Text>Done</ReactNative.Text>
          </Pressable>
        </ThemeProvider>,
      );
      lastProps().onKeyDown?.(space() as never);
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("presses once when a caller still spreads spacePress, and keeps the caller's other keys", async () => {
      const onPress = jest.fn();
      const onEscape = jest.fn();
      const own = spacePress(onPress);
      // React Native's types know no onKeyDown: callers spread it, as they spread spacePress.
      const keys = {
        onKeyDown: (event: { readonly key: string }) => {
          own.onKeyDown?.(event as never);
          if (event.key === "Escape") {
            onEscape();
          }
        },
      };
      await render(
        <ThemeProvider forced="light">
          <Pressable {...keys} onPress={onPress} role="radio">
            <ReactNative.Text>One</ReactNative.Text>
          </Pressable>
        </ThemeProvider>,
      );
      lastProps().onKeyDown?.(space() as never);
      expect(onPress).toHaveBeenCalledTimes(1);
      lastProps().onKeyDown?.({ ...space(), key: "Escape" } as never);
      expect(onEscape).toHaveBeenCalledTimes(1);
    });
  });

  it("passes no press, no state layer and plays nothing when it has nothing to do", async () => {
    await render(
      <ThemeProvider forced="light">
        <Pressable haptic="confirm" role="button">
          <ReactNative.Text>Idle</ReactNative.Text>
        </Pressable>
      </ThemeProvider>,
    );
    expect(lastProps().onPress).toBeUndefined();
    expect((lastProps() as { dataSet?: unknown }).dataSet).toBeUndefined();
    await fireEvent.press(screen.getByRole("button", { name: "Idle" }));
    expect(jest.mocked(haptic)).not.toHaveBeenCalled();
  });
});

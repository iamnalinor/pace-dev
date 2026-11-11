import { fireEvent, screen, within } from "@testing-library/react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { withWindowWidth } from "#app/test/window.ts";
import { space } from "@pace/core";

import { useContentRegionLayout } from "./float-layer.ts";
import { Screen } from "./screen.tsx";
import { useToast } from "./toast.tsx";

const Shows = ({ message }: { readonly message: string }) => {
  const toast = useToast();
  useEffect(() => {
    toast.show({ message });
  }, [message, toast]);
  return null;
};

const FOOTER_HEIGHT = 88;

/** The footer takes its height from its layout, as the time bar does. */
const layOutFooter = async (): Promise<void> => {
  await fireEvent(screen.getByTestId("screen-footer"), "layout", {
    nativeEvent: { layout: { height: FOOTER_HEIGHT, width: 390, x: 0, y: 0 } },
  });
};

/** How far the toast floats above the bottom edge. */
const bottomOfToast = (): number => {
  const style = StyleSheet.flatten(screen.getByTestId("toast-place").props["style"] as ViewStyle);
  return typeof style.bottom === "number" ? style.bottom : NaN;
};

/** A screen whose footer goes away when "Leave" is pressed. */
const Leaves = () => {
  const [hasFooter, setHasFooter] = useState(true);
  return (
    <Screen footer={hasFooter ? <Text>Time bar</Text> : undefined}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setHasFooter(false);
        }}
      >
        <Text>Leave</Text>
      </Pressable>
      <Shows message="Nothing to start" />
    </Screen>
  );
};

/** Now's list beside a task pane, each with its footer; "Close the pane" drops the pane. */
const SideBySide = () => {
  const [hasPane, setHasPane] = useState(true);
  return (
    <>
      <Screen footer={<Text>Time bar</Text>}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setHasPane(false);
          }}
        >
          <Text>Close the pane</Text>
        </Pressable>
        <Shows message="Deleted" />
      </Screen>
      {hasPane ? (
        <Screen footer={<Text>Done</Text>}>
          <Text>Task</Text>
        </Screen>
      ) : null}
    </>
  );
};

describe("a toast on a screen with a footer", () => {
  it("stays above the list's footer when the pane beside it (with its own) closes", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<SideBySide />, runtime);
    for (const footer of screen.getAllByTestId("screen-footer")) {
      await fireEvent(footer, "layout", {
        nativeEvent: { layout: { height: FOOTER_HEIGHT, width: 390, x: 0, y: 0 } },
      });
    }
    await fireEvent.press(screen.getByRole("button", { name: "Close the pane" }));
    expect(bottomOfToast()).toBe(FOOTER_HEIGHT + space["3"]);
  });

  it("sits above the footer, not over the footer's buttons", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(
      <Screen footer={<Text>Time bar</Text>}>
        <Shows message="Nothing to start" />
      </Screen>,
      runtime,
    );
    await layOutFooter();
    // The footer (88) and `space.3` of air; no tab bar is on screen here (its own test: toast.test).
    expect(bottomOfToast()).toBe(FOOTER_HEIGHT + space["3"]);
  });

  it("floats just above the bottom edge on a screen without a footer or a tab bar", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(
      <Screen>
        <Shows message="Nothing to start" />
      </Screen>,
      runtime,
    );
    expect(bottomOfToast()).toBe(space["3"]);
  });

  it("drops back when the screen with the footer is gone", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Leaves />, runtime);
    await layOutFooter();
    expect(bottomOfToast()).toBe(FOOTER_HEIGHT + space["3"]);
    await fireEvent.press(screen.getByRole("button", { name: "Leave" }));
    expect(bottomOfToast()).toBe(space["3"]);
  });
});

/** The body's scroll, as React Native reports it. */
const scrollTo = async (y: number): Promise<void> => {
  await fireEvent.scroll(screen.getByTestId("screen-body"), {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { height: 2000, width: 390 },
      layoutMeasurement: { height: 700, width: 390 },
    },
  });
};

const edgeClasses = (): readonly string[] =>
  (screen.getByTestId("screen-header-edge").props["className"] as string).split(" ");

describe("the header's scroll edge (F-LAY-13)", () => {
  it("shows a hairline on the page's ground once content scrolls under the header, and none at rest", async () => {
    await renderScreen(
      <Screen header={<Text>Header</Text>}>
        <Text>Body</Text>
      </Screen>,
      await createTestRuntime(),
    );
    expect(edgeClasses()).toEqual(expect.arrayContaining(["bg-app", "border-transparent"]));
    await scrollTo(40);
    expect(edgeClasses()).toEqual(expect.arrayContaining(["bg-app", "border-separator"]));
    await scrollTo(0);
    expect(edgeClasses()).toContain("border-transparent");
  });

  it("lets the list scroll out from under a toast: its foot grows by what floats over it", async () => {
    await renderScreen(
      <Screen header={<Text>Header</Text>}>
        <Shows message="Deleted" />
      </Screen>,
      await createTestRuntime(),
    );
    await fireEvent(screen.getByTestId("toast"), "layout", {
      nativeEvent: { layout: { height: 120, width: 358, x: 0, y: 0 } },
    });
    const style = StyleSheet.flatten(
      screen.getByTestId("screen-body").props["contentContainerStyle"] as ViewStyle,
    );
    expect(style.paddingBottom).toBe(120 + 2 * space["3"]);
  });
});

/** Where the toast's box is placed across the window. */
const placeOfToast = (): ViewStyle =>
  StyleSheet.flatten(screen.getByTestId("toast-place").props["style"] as ViewStyle);

/** The shell's content region, publishing where it is. */
const Region = () => {
  const onLayout = useContentRegionLayout(true);
  return <View onLayout={onLayout} testID="region" />;
};

/** The window, then the content region beside a 248 sidebar, as their layouts report them. */
const layOutWideWindow = async (): Promise<void> => {
  const area = screen.getByTestId("toast-place").parent;
  if (area === null) {
    throw new Error("The toast's place has no area around it");
  }
  await fireEvent(area, "layout", {
    nativeEvent: { layout: { height: 900, width: 1440, x: 0, y: 0 } },
  });
  await fireEvent(screen.getByTestId("region"), "layout", {
    nativeEvent: { layout: { height: 900, width: 1192, x: 248, y: 0 } },
  });
};

describe("what floats over a wide screen (QA PR55-1-14)", () => {
  withWindowWidth(1440);

  it.each([
    ["content", 720],
    ["wide", 960],
  ] as const)(
    "keeps to the %s column (%d) it hugs, not the whole region",
    async (anchor, width) => {
      await renderScreen(
        <>
          <Region />
          <Screen anchor={anchor}>
            <Shows message="Deleted" />
          </Screen>
        </>,
        await createTestRuntime(),
      );
      await layOutWideWindow();
      expect(placeOfToast()).toMatchObject({ left: 248 + 16, right: 1440 - (248 + width) + 16 });
    },
  );
});

/** Whether the footer is laid out inside the scrolling body (it scrolls with the content). */
const isFooterInBody = (): boolean =>
  within(screen.getByTestId("screen-body")).queryByTestId("screen-footer") !== null;

describe("the footer on a short window (spec §5.1, Q12: at 320 px and 200 % the bar scrolls with content)", () => {
  describe("a phone of usual height", () => {
    it("keeps the footer fixed under the content", async () => {
      await renderScreen(
        <Screen footer={<Text>Time bar</Text>}>
          <Text>List</Text>
        </Screen>,
        await createTestRuntime({ world: "empty" }),
      );
      expect(isFooterInBody()).toBe(false);
    });
  });

  describe("a short window (320 × 568)", () => {
    withWindowWidth(320, 568);

    it("lays the footer at the end of the content, so the list keeps the window", async () => {
      await renderScreen(
        <Screen footer={<Text>Time bar</Text>}>
          <Text>List</Text>
        </Screen>,
        await createTestRuntime({ world: "empty" }),
      );
      expect(isFooterInBody()).toBe(true);
      expect(screen.getByText("Time bar")).toBeOnTheScreen();
    });
  });

  describe("a computer at 200 % zoom (640 × 450)", () => {
    withWindowWidth(640, 450);

    it("lays the footer at the end of the content too", async () => {
      await renderScreen(
        <Screen footer={<Text>Time bar</Text>}>
          <Text>List</Text>
        </Screen>,
        await createTestRuntime({ world: "empty" }),
      );
      expect(isFooterInBody()).toBe(true);
    });
  });
});

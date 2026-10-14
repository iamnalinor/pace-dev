import { fireEvent, screen } from "@testing-library/react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

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
  const style = StyleSheet.flatten(screen.getByTestId("toast").props["style"] as ViewStyle);
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

describe("a toast on a screen with a footer", () => {
  it("sits above the footer and the phone's tab bar, not over the footer's buttons", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(
      <Screen footer={<Text>Time bar</Text>}>
        <Shows message="Nothing to start" />
      </Screen>,
      runtime,
    );
    await layOutFooter();
    // The tab bar (72), the footer (88) and 12 px of air.
    expect(bottomOfToast()).toBe(72 + FOOTER_HEIGHT + 12);
  });

  it("floats at the usual height on a screen without a footer", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(
      <Screen>
        <Shows message="Nothing to start" />
      </Screen>,
      runtime,
    );
    expect(bottomOfToast()).toBe(96);
  });

  it("drops back when the screen with the footer is gone", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Leaves />, runtime);
    await layOutFooter();
    expect(bottomOfToast()).toBe(72 + FOOTER_HEIGHT + 12);
    await fireEvent.press(screen.getByRole("button", { name: "Leave" }));
    expect(bottomOfToast()).toBe(96);
  });
});

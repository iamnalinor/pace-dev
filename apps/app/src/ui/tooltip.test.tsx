import { act, fireEvent, screen } from "@testing-library/react-native";
import { Pressable, Text, View } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { TAP_TOOLTIP_MS } from "./tooltip-place.ts";
import { Tooltip } from "./tooltip.tsx";

const LABEL = "No calendar events around now";

const Trigger = ({ label, onPress }: { readonly label?: string; readonly onPress: () => void }) => (
  <View>
    <Tooltip label={label}>
      <Pressable accessibilityLabel="Calendar" accessibilityRole="button" onPress={onPress}>
        <Text>Calendar</Text>
      </Pressable>
    </Tooltip>
    <Text>Elsewhere</Text>
  </View>
);

/** A finger on the trigger: the touch ends (the tooltip's cue), then the press runs. */
const tap = async (): Promise<void> => {
  const button = screen.getByRole("button", { name: "Calendar" });
  await fireEvent(button, "touchEnd");
  await fireEvent.press(button);
};

describe("Tooltip on a phone", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows at once on a tap of its trigger, whose own press still runs, and goes after a while", async () => {
    const onPress = jest.fn();
    await renderScreen(<Trigger label={LABEL} onPress={onPress} />, await createTestRuntime());
    jest.useFakeTimers();
    expect(screen.queryByText(LABEL)).toBeNull();
    await tap();
    expect(screen.getByText(LABEL)).toBeOnTheScreen();
    expect(onPress).toHaveBeenCalledTimes(1);
    await act(() => {
      jest.advanceTimersByTime(TAP_TOOLTIP_MS);
    });
    expect(screen.queryByText(LABEL)).toBeNull();
  });

  it("goes on the next tap anywhere", async () => {
    await renderScreen(<Trigger label={LABEL} onPress={jest.fn()} />, await createTestRuntime());
    await tap();
    expect(screen.getByText(LABEL)).toBeOnTheScreen();
    await fireEvent(screen.getByText("Elsewhere"), "touchStart");
    expect(screen.queryByText(LABEL)).toBeNull();
  });

  it("shows nothing without a label", async () => {
    const onPress = jest.fn();
    await renderScreen(<Trigger onPress={onPress} />, await createTestRuntime());
    await tap();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(LABEL)).toBeNull();
  });
});

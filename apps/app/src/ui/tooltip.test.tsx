import { act, fireEvent, screen } from "@testing-library/react-native";
import { Pressable, Text, View } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { Tooltip } from "./tooltip.tsx";

const LABEL = "Night hours";

describe("Tooltip on a phone (spec §4.2.31)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows nothing on a tap: the tap runs the control, whose name stays its own", async () => {
    const onPress = jest.fn();
    await renderScreen(
      <View>
        <Tooltip label={LABEL}>
          <Pressable accessibilityLabel={LABEL} accessibilityRole="switch" onPress={onPress}>
            <Text>Moon</Text>
          </Pressable>
        </Tooltip>
      </View>,
      await createTestRuntime(),
    );
    jest.useFakeTimers();
    const trigger = screen.getByRole("switch", { name: LABEL });
    await fireEvent(trigger, "touchEnd");
    await fireEvent.press(trigger);
    await fireEvent(trigger, "longPress");
    await act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    // Only the control's own name: no bubble came up.
    expect(screen.getAllByLabelText(LABEL)).toHaveLength(1);
    expect(screen.queryByText(LABEL)).toBeNull();
  });
});

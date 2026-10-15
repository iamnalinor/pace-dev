import { act, fireEvent, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { TAP_TOOLTIP_MS } from "./tooltip-place.ts";
import { Tooltip } from "./tooltip.web.tsx";

const LABEL = "Send to the assistant · ↵";

const renderTrigger = async (onPress: () => void = jest.fn()) => {
  await renderScreen(
    <Tooltip label={LABEL}>
      <Pressable accessibilityLabel="Send" accessibilityRole="button" onPress={onPress}>
        <Text>Send</Text>
      </Pressable>
    </Tooltip>,
    await createTestRuntime(),
  );
  // From here on the clock stands still: whatever shows, shows with no time passing.
  jest.useFakeTimers();
  return screen.getByRole("button", { name: "Send" });
};

/** The tooltip's own box around the trigger. */
const wrapperOf = (trigger: ReturnType<typeof screen.getByRole>) => {
  const { parent } = trigger;
  if (parent === null) {
    throw new Error("the trigger has no tooltip around it");
  }
  return parent;
};

const pointer = (pointerType: string) => ({ nativeEvent: { pointerType } });

describe("Tooltip on the web", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows on hover with no delay and hides when the pointer leaves", async () => {
    const button = await renderTrigger();
    expect(screen.queryByRole("tooltip")).toBeNull();
    await fireEvent(button, "pointerEnter", pointer("mouse"));
    expect(screen.getByRole("tooltip")).toHaveTextContent(LABEL);
    await fireEvent(button, "pointerLeave", pointer("mouse"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows on keyboard focus and Escape hides it", async () => {
    const button = await renderTrigger();
    // The DOM's focus event bubbles from the button up to the tooltip around it.
    await fireEvent(wrapperOf(button), "focus", {});
    expect(screen.getByRole("tooltip")).toHaveTextContent(LABEL);
    await fireEvent(button, "keyDown", { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("stays while the trigger has the keyboard's focus, whatever the pointer does", async () => {
    const button = await renderTrigger();
    await fireEvent(wrapperOf(button), "focus", {});
    await fireEvent(button, "pointerEnter", pointer("mouse"));
    await fireEvent(button, "pointerLeave", pointer("mouse"));
    expect(screen.getByRole("tooltip")).toHaveTextContent(LABEL);
  });

  it("on a touch screen shows on a tap (the press still runs) and goes after a while", async () => {
    const onPress = jest.fn();
    const button = await renderTrigger(onPress);
    // A finger's pointer entering is not a hover.
    await fireEvent(button, "pointerEnter", pointer("touch"));
    expect(screen.queryByRole("tooltip")).toBeNull();
    await fireEvent(button, "pointerUp", pointer("touch"));
    await fireEvent.press(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent(LABEL);
    expect(onPress).toHaveBeenCalledTimes(1);
    await act(() => {
      jest.advanceTimersByTime(TAP_TOOLTIP_MS);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { Pressable, Text, View } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { HOVER_DELAY_MS, HOVER_GRACE_MS, WARM_MS } from "./tooltip-place.ts";
import { Tooltip } from "./tooltip.web.tsx";

const LABEL = "Send to the assistant · ↵";
const OTHER = "Close · Esc";

const NOTHING = (): void => undefined;

const Trigger = ({
  isImmediate = false,
  label,
  name,
  onPress,
}: {
  readonly isImmediate?: boolean;
  readonly label: string;
  readonly name: string;
  readonly onPress?: () => void;
}) => (
  <Tooltip isImmediate={isImmediate} label={label}>
    <Pressable accessibilityLabel={name} accessibilityRole="button" onPress={onPress ?? NOTHING}>
      <Text>{name}</Text>
    </Pressable>
  </Tooltip>
);

const renderTriggers = async (ui: React.ReactElement) => {
  await renderScreen(<View>{ui}</View>, await createTestRuntime());
  // From here on the clock stands still: whatever shows, shows when the test lets time pass.
  jest.useFakeTimers();
};

const pointer = (pointerType: string) => ({ nativeEvent: { pointerType } });

const button = (name: string) => screen.getByRole("button", { name });

/** The tooltip's own box around the trigger. */
const sendWrapper = () => {
  const { parent } = button("Send");
  if (parent === null) {
    throw new Error("the trigger has no tooltip around it");
  }
  return parent;
};

const pass = async (ms: number): Promise<void> => {
  await act(() => {
    jest.advanceTimersByTime(ms);
  });
};

/** The bubble's first layout: it is measured, and placed. */
const layOut = async (bubble: ReturnType<typeof screen.getByTestId>): Promise<void> => {
  await fireEvent(bubble, "layout", { nativeEvent: { layout: { height: 32, width: 120 } } });
};

/** Whether the bubble that says `label` is shown (a hidden one is not in the page at all). */
const isShown = (label: string): boolean =>
  screen
    .queryAllByTestId("tooltip-bubble")
    .some((bubble) => within(bubble).queryByText(label) !== null);

/** The window the tooltip listens on (the test runs without a browser: a bare event target). */
const page = new EventTarget();

/** A real Escape on the window: nothing about its propagation is mocked. */
const pressOnWindow = async (type: "keydown" | "keyup"): Promise<void> => {
  await act(() => {
    page.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), {
        altKey: false,
        isComposing: false,
        ctrlKey: false,
        key: "Escape",
        metaKey: false,
        shiftKey: false,
      }),
    );
  });
};

beforeAll(() => {
  Object.assign(globalThis, {
    addEventListener: page.addEventListener.bind(page),
    removeEventListener: page.removeEventListener.bind(page),
  });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "addEventListener");
  Reflect.deleteProperty(globalThis, "removeEventListener");
});

describe("Tooltip on the web (spec §4.2.31, §6 tooltip)", () => {
  afterEach(async () => {
    // A tooltip left open would make the next test's trigger "warm".
    await pass(WARM_MS * 2);
    jest.useRealTimers();
  });

  it("shows after the pointer rests on the trigger for 400 ms, not before", async () => {
    await renderTriggers(<Trigger label={LABEL} name="Send" />);
    await fireEvent(button("Send"), "pointerEnter", pointer("mouse"));
    await pass(HOVER_DELAY_MS - 50);
    expect(isShown(LABEL)).toBe(false);
    await pass(50);
    expect(isShown(LABEL)).toBe(true);
  });

  it("passing over a trigger on the way elsewhere brings nothing up", async () => {
    await renderTriggers(<Trigger label={LABEL} name="Send" />);
    await fireEvent(button("Send"), "pointerEnter", pointer("mouse"));
    await pass(100);
    await fireEvent(button("Send"), "pointerLeave", pointer("mouse"));
    await pass(HOVER_DELAY_MS);
    expect(isShown(LABEL)).toBe(false);
  });

  it("says why a control is unavailable at once (isImmediate)", async () => {
    await renderTriggers(<Trigger isImmediate label={LABEL} name="Calendar" />);
    await fireEvent(button("Calendar"), "pointerEnter", pointer("mouse"));
    expect(isShown(LABEL)).toBe(true);
  });

  it("goes after the grace when the pointer leaves before the shown bubble is drawn (a quick pass over an immediate one)", async () => {
    await renderTriggers(<Trigger isImmediate label={LABEL} name="Calendar" />);
    const { parent } = button("Calendar");
    if (parent === null) {
      throw new Error("the trigger has no tooltip around it");
    }
    // Both in one go: the leave comes before the render that the enter asked for.
    const handlers = parent.props as Record<
      "onPointerEnter" | "onPointerLeave",
      (event: unknown) => void
    >;
    await act(() => {
      handlers.onPointerEnter(pointer("mouse"));
      handlers.onPointerLeave(pointer("mouse"));
    });
    await pass(HOVER_GRACE_MS);
    expect(isShown(LABEL)).toBe(false);
  });

  it("stays while the pointer moves onto the bubble, and goes once it leaves both (WCAG 1.4.13)", async () => {
    await renderTriggers(<Trigger label={LABEL} name="Send" />);
    await fireEvent(button("Send"), "pointerEnter", pointer("mouse"));
    await pass(HOVER_DELAY_MS);
    await fireEvent(button("Send"), "pointerLeave", pointer("mouse"));
    const bubble = screen.getAllByTestId("tooltip-bubble")[0];
    if (bubble === undefined) {
      throw new Error("no bubble");
    }
    await layOut(bubble);
    expect(bubble.props["pointerEvents"]).toBe("auto");
    await fireEvent(bubble, "pointerEnter", pointer("mouse"));
    await pass(HOVER_GRACE_MS * 3);
    expect(isShown(LABEL)).toBe(true);
    await fireEvent(bubble, "pointerLeave", pointer("mouse"));
    await pass(HOVER_GRACE_MS);
    expect(isShown(LABEL)).toBe(false);
  });

  it("an unplaced bubble takes no pointer: one mounted under the leaving pointer does not keep itself up", async () => {
    await renderTriggers(<Trigger isImmediate label={LABEL} name="Send" />);
    await fireEvent(button("Send"), "pointerEnter", pointer("mouse"));
    const bubble = screen.getAllByTestId("tooltip-bubble")[0];
    if (bubble === undefined) {
      throw new Error("no bubble");
    }
    // Not measured yet: it waits at the window's corner, unseen, where the pointer may be going.
    expect(bubble.props["pointerEvents"]).toBe("none");
    expect(bubble.props["style"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ visibility: "hidden" })]),
    );
    // Nothing on it calls off the hide (here the bubble is not in a portal, so an event fired on
    // it would reach the trigger's wrapper: its own handlers are what is checked).
    expect(bubble.props["onPointerEnter"]).toBeUndefined();
    await fireEvent(button("Send"), "pointerLeave", pointer("mouse"));
    await pass(HOVER_GRACE_MS);
    expect(isShown(LABEL)).toBe(false);
  });

  it("a pointer moving off the trigger and the bubble takes a hover tooltip away, though no leave came", async () => {
    await renderTriggers(<Trigger isImmediate label={LABEL} name="Send" />);
    await fireEvent(button("Send"), "pointerEnter", pointer("mouse"));
    expect(isShown(LABEL)).toBe(true);
    // Moves elsewhere on the page, one after another: the grace runs from the first, not the last.
    for (const _ of [1, 2, 3]) {
      await act(() => {
        page.dispatchEvent(new Event("pointermove"));
        jest.advanceTimersByTime(HOVER_GRACE_MS / 2);
      });
    }
    expect(isShown(LABEL)).toBe(false);
  });

  it("a press anywhere takes it away at once: its grace cannot hold the next Escape from a sheet just opened", async () => {
    await renderTriggers(<Trigger isImmediate label={LABEL} name="Send" />);
    await fireEvent(button("Send"), "pointerEnter", pointer("mouse"));
    expect(isShown(LABEL)).toBe(true);
    await act(() => {
      page.dispatchEvent(new Event("pointerdown"));
    });
    expect(isShown(LABEL)).toBe(false);
  });

  it("a pointer moving elsewhere leaves a keyboard-focus tooltip up", async () => {
    await renderTriggers(<Trigger label={LABEL} name="Send" />);
    await fireEvent(sendWrapper(), "focus", {});
    await act(() => {
      page.dispatchEvent(new Event("pointermove"));
    });
    await pass(HOVER_GRACE_MS * 2);
    expect(isShown(LABEL)).toBe(true);
  });

  it("shows the next trigger's at once when the pointer moves on from one", async () => {
    await renderTriggers(
      <>
        <Trigger label={LABEL} name="Send" />
        <Trigger label={OTHER} name="Close" />
      </>,
    );
    await fireEvent(button("Send"), "pointerEnter", pointer("mouse"));
    await pass(HOVER_DELAY_MS);
    await fireEvent(button("Send"), "pointerLeave", pointer("mouse"));
    await fireEvent(button("Close"), "pointerEnter", pointer("mouse"));
    expect(isShown(OTHER)).toBe(true);
  });

  it("shows on keyboard focus at once and Escape hides it", async () => {
    await renderTriggers(<Trigger label={LABEL} name="Send" />);
    // The DOM's focus event bubbles from the button up to the tooltip around it.
    await fireEvent(sendWrapper(), "focus", {});
    expect(isShown(LABEL)).toBe(true);
    await pressOnWindow("keydown");
    expect(isShown(LABEL)).toBe(false);
  });

  it("stays while the trigger has the keyboard's focus, whatever the pointer does", async () => {
    await renderTriggers(<Trigger label={LABEL} name="Send" />);
    await fireEvent(sendWrapper(), "focus", {});
    await fireEvent(button("Send"), "pointerEnter", pointer("mouse"));
    await fireEvent(button("Send"), "pointerLeave", pointer("mouse"));
    await pass(HOVER_GRACE_MS * 3);
    expect(isShown(LABEL)).toBe(true);
  });

  it("mounts no bubble until it is first shown, and takes it away when hidden (UI review I3)", async () => {
    await renderTriggers(
      <>
        <Trigger label={LABEL} name="Send" />
        <Trigger label={OTHER} name="Close" />
      </>,
    );
    expect(screen.queryAllByTestId("tooltip-bubble", { includeHiddenElements: true })).toHaveLength(
      0,
    );
    // The description the trigger points at is there all along, unseen and never laid out.
    const descriptions = screen.getAllByTestId("tooltip-description", {
      includeHiddenElements: true,
    });
    expect(descriptions).toHaveLength(2);
    for (const [index, text] of [LABEL, OTHER].entries()) {
      const description = descriptions[index];
      if (description === undefined) {
        throw new Error("a description is missing");
      }
      expect(within(description).getByText(text, { includeHiddenElements: true })).toBeTruthy();
    }
    expect(descriptions[0]?.props["style"]).toMatchObject({ display: "none" });
    await fireEvent(button("Send"), "pointerEnter", pointer("mouse"));
    await pass(HOVER_DELAY_MS);
    expect(screen.getAllByTestId("tooltip-bubble")).toHaveLength(1);
    await fireEvent(button("Send"), "pointerLeave", pointer("mouse"));
    await pass(HOVER_GRACE_MS);
    expect(screen.queryAllByTestId("tooltip-bubble", { includeHiddenElements: true })).toHaveLength(
      0,
    );
  });

  it("on Escape only the tooltip goes: no other listener hears the key or its keyup (the sheet under it stays)", async () => {
    await renderTriggers(<Trigger label={LABEL} name="Send" />);
    await fireEvent(sendWrapper(), "focus", {});
    // A sheet's Escape (a shortcut, react-native-web's Modal): on the window after the tooltip's.
    const onSheetKey = jest.fn();
    page.addEventListener("keydown", onSheetKey, { capture: true });
    page.addEventListener("keyup", onSheetKey, { capture: true });
    await pressOnWindow("keydown");
    await pressOnWindow("keyup");
    expect(isShown(LABEL)).toBe(false);
    expect(onSheetKey).not.toHaveBeenCalled();
    // The tooltip is gone: the next Escape is the sheet's.
    await pressOnWindow("keydown");
    await pressOnWindow("keyup");
    expect(onSheetKey).toHaveBeenCalledTimes(2);
    page.removeEventListener("keydown", onSheetKey, { capture: true });
    page.removeEventListener("keyup", onSheetKey, { capture: true });
  });

  it("shows no hover tooltip where the device cannot hover finely, whatever pointer type a tap reports (design review 2 N4)", async () => {
    const coarse = jest.fn((query: string) => ({ matches: !query.includes("hover") }));
    Object.assign(globalThis, { matchMedia: coarse });
    try {
      await renderTriggers(<Trigger label={LABEL} name="Send" />);
      // A phone's browser can send a tap's compatibility events as a mouse's.
      await fireEvent(button("Send"), "pointerEnter", pointer("mouse"));
      await pass(HOVER_DELAY_MS * 2);
      expect(isShown(LABEL)).toBe(false);
      expect(coarse).toHaveBeenCalledWith("(hover: hover) and (pointer: fine)");
    } finally {
      Reflect.deleteProperty(globalThis, "matchMedia");
    }
  });

  it("on a touch screen shows nothing: the tap runs the control", async () => {
    const onPress = jest.fn();
    await renderTriggers(<Trigger label={LABEL} name="Send" onPress={onPress} />);
    await fireEvent(button("Send"), "pointerEnter", pointer("touch"));
    await fireEvent(button("Send"), "pointerUp", pointer("touch"));
    await fireEvent.press(button("Send"));
    await pass(HOVER_DELAY_MS * 2);
    expect(isShown(LABEL)).toBe(false);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

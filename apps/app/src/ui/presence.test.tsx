import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";

import { presenceFrom, presenceTiming } from "./motion-presets.ts";
import { Presence } from "./presence.tsx";

/** The animations started, with the callbacks that finish them (the test decides when). */
const mockTimings: {
  readonly to: number;
  readonly done: ((isFinished: boolean) => void) | undefined;
}[] = [];

jest.mock("react-native-reanimated", (): unknown => {
  // The Jest mock of reanimated (jest.setup.ts), its timing replaced: styles are drawn as computed.
  const actual = jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock");
  return {
    ...actual,
    __esModule: true,
    withTiming: (to: number, _config: unknown, done?: (isFinished: boolean) => void) => {
      mockTimings.push({ done, to });
      return to;
    },
  };
});

beforeEach(() => {
  mockTimings.length = 0;
});

/** Finishes the last animation started, as reanimated does when it completes. */
const finishLast = async (): Promise<void> => {
  await act(() => {
    mockTimings.at(-1)?.done?.(true);
  });
};

describe("Presence (spec §4.1.1, §6)", () => {
  it("keeps its children through the exit and lets go only when the exit finishes (never a timer)", async () => {
    const onExited = jest.fn();
    const view = await render(
      <Presence onExited={onExited} show>
        <Text>Preview</Text>
      </Presence>,
    );
    await view.rerender(
      <Presence onExited={onExited} show={false}>
        <Text>Preview</Text>
      </Presence>,
    );
    expect(screen.getByText("Preview")).toBeOnTheScreen();
    expect(onExited).not.toHaveBeenCalled();
    expect(mockTimings.at(-1)?.to).toBe(0);
    await finishLast();
    expect(screen.queryByText("Preview")).toBeNull();
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it("animates nothing on its first render (initial={false}, F-MOT-07), but enters when shown later", async () => {
    const view = await render(
      <Presence show>
        <Text>Row</Text>
      </Presence>,
    );
    expect(mockTimings).toHaveLength(0);
    await view.rerender(
      <Presence show={false}>
        <Text>Row</Text>
      </Presence>,
    );
    await finishLast();
    mockTimings.length = 0;
    await view.rerender(
      <Presence show>
        <Text>Row</Text>
      </Presence>,
    );
    expect(screen.getByText("Row")).toBeOnTheScreen();
    expect(mockTimings.at(-1)?.to).toBe(1);
  });

  it("enters from the start on its first render when told (initial)", async () => {
    await render(
      <Presence initial show>
        <Text>Toast</Text>
      </Presence>,
    );
    expect(mockTimings.at(-1)?.to).toBe(1);
  });

  it("draws nothing while hidden", async () => {
    await render(
      <Presence show={false}>
        <Text>Gone</Text>
      </Presence>,
    );
    expect(screen.queryByText("Gone")).toBeNull();
  });

  it("with reduced motion, every preset is opacity only, in duration.sm", async () => {
    expect(presenceFrom("rise", true)).toEqual({ opacity: 0 });
    expect(presenceFrom("scale", true)).toEqual({ opacity: 0 });
    expect(presenceFrom("rise", false)).toEqual({ opacity: 0, translateY: 8 });
    expect(presenceFrom("scale", false)).toEqual({ opacity: 0, scale: 0.96 });
    expect(presenceTiming("rise", true)).toEqual({ enter: 160, exit: 160 });
    expect(presenceTiming("rise", false)).toEqual({ enter: 220, exit: 160 });
    expect(presenceFrom("lift", false)).toEqual({ opacity: 0, translateY: 4 });
    expect(presenceTiming("lift", false)).toEqual({ enter: 160, exit: 110 });
    expect(presenceFrom("slide", false)).toEqual({ opacity: 0, translateX: 16 });
    expect(presenceFrom("slide", true)).toEqual({ opacity: 0 });
    expect(presenceTiming("slide", false)).toEqual({ enter: 220, exit: 160 });
  });

  it("with reduced motion, the drawn start frame has no travel", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const view = await render(
      <Presence enter="rise" show={false} testID="presence">
        <Text>Card</Text>
      </Presence>,
    );
    // The system's answer arrives after the first render.
    await act(async () => {
      await Promise.resolve();
    });
    await view.rerender(
      <Presence enter="rise" initial show testID="presence">
        <Text>Card</Text>
      </Presence>,
    );
    const style = screen.getByTestId("presence").props["style"] as unknown;
    expect(JSON.stringify(style)).not.toContain("translateY");
    jest.restoreAllMocks();
  });
});

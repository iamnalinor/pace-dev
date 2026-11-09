import { act, renderHook } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import {
  forgetReducedMotion,
  seedReducedMotion,
  useIsMotionReduced,
} from "./use-reduced-motion.ts";

/** The system's answer, and the one listener the store adds (captured to play a change). */
const system = (isReduced: boolean) => {
  type Listener = (isReduced: boolean) => void;
  const listeners: Listener[] = [];
  const read = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(isReduced);
  const added = jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation((_event, listener) => {
      listeners.push(listener as unknown as Listener);
      return { remove: jest.fn() } as unknown as ReturnType<
        typeof AccessibilityInfo.addEventListener
      >;
    });
  return { added, listeners, read };
};

beforeEach(() => {
  forgetReducedMotion();
  // jest-expo's AccessibilityInfo is a mock already: a spy on it keeps the calls of earlier tests.
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useIsMotionReduced (UI review I1: read once, at the app's start)", () => {
  it("is already right on the first render once the app has seeded it", async () => {
    system(true);
    await seedReducedMotion();
    const { result } = await renderHook(() => useIsMotionReduced());
    // No wait: an overlay mounted now plays its reduced preset from its first frame.
    expect(result.current).toBe(true);
  });

  it("asks the system once and keeps one subscription, however many read it", async () => {
    const { added, read } = system(false);
    await seedReducedMotion();
    await seedReducedMotion();
    await renderHook(() => [useIsMotionReduced(), useIsMotionReduced(), useIsMotionReduced()]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(added).toHaveBeenCalledTimes(1);
  });

  it("follows the system when it changes", async () => {
    const { listeners } = system(false);
    await seedReducedMotion();
    const { result } = await renderHook(() => useIsMotionReduced());
    expect(result.current).toBe(false);
    await act(() => {
      for (const listener of listeners) {
        listener(true);
      }
    });
    expect(result.current).toBe(true);
  });

  it("seeds itself on the first read when the app has not, and follows once the system answers", async () => {
    system(true);
    const { result } = await renderHook(() => useIsMotionReduced());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });
});

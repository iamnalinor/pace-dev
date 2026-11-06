import { act, renderHook } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { useIsMotionReduced } from "./use-reduced-motion.ts";

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useIsMotionReduced", () => {
  it("follows the system's setting once it has answered", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const { result } = await renderHook(() => useIsMotionReduced());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });

  it("is off until the system says otherwise", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    const { result } = await renderHook(() => useIsMotionReduced());
    expect(result.current).toBe(false);
  });
});

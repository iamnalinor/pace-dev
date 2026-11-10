import { renderHook } from "@testing-library/react-native";
import { useWindowDimensions } from "react-native";

import { breakpointOf, useBreakpoint } from "./use-breakpoint.ts";

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const windowOf = jest.mocked(useWindowDimensions);

describe("useBreakpoint (spec §3.3: compact < 600 ≤ medium < 1024 ≤ expanded)", () => {
  it.each([
    [320, "compact"],
    [599, "compact"],
    [600, "medium"],
    [800, "medium"],
    [1023, "medium"],
    [1024, "expanded"],
    [1440, "expanded"],
  ] as const)("calls %i px %s", (width, expected) => {
    expect(breakpointOf(width)).toBe(expected);
  });

  it("follows the window: 800 px is medium", async () => {
    windowOf.mockReturnValue({ fontScale: 1, height: 1280, scale: 1, width: 800 });
    const { result } = await renderHook(() => useBreakpoint());
    expect(result.current).toBe("medium");
  });
});

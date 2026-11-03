import { act } from "@testing-library/react-native";
import { Dimensions } from "react-native";

/** The phone window `jest.setup.ts` gives every test. */
const PHONE = { fontScale: 1, height: 844, scale: 3, width: 390 } as const;

/**
Gives the test a window of this width (a tablet at 800, a desktop at 1440) for its breakpoint
(`useBreakpoint`), and puts the phone back after it. Call it at the top of a `describe`.
*/
export const withWindowWidth = (width: number): void => {
  beforeEach(() => {
    const window = { ...PHONE, height: 900, width };
    Dimensions.set({ screen: window, window });
  });
  afterEach(async () => {
    // The tree may still be mounted: it hears the change, inside act.
    await act(() => {
      Dimensions.set({ screen: PHONE, window: PHONE });
    });
  });
};

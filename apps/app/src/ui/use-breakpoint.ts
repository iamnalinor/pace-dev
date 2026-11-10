import { useWindowDimensions } from "react-native";

import { layout } from "@pace/core";

/**
The shell's three widths (spec §3.3, §5.0.1): `compact` (a phone: tab bar, pushed screens, sheets),
`medium` (a tablet or an unfolded phone: the navigation rail, the inspector as a sheet) and
`expanded` (a laptop or a desktop browser: sidebar, content and inspector side by side).
*/
export type Breakpoint = "compact" | "expanded" | "medium";

/** The breakpoint of a window this many px/dp wide (the `layout.breakpoint` tokens). */
export const breakpointOf = (width: number): Breakpoint => {
  if (width >= layout.breakpoint.expanded) {
    return "expanded";
  }
  return width >= layout.breakpoint.medium ? "medium" : "compact";
};

/** The window's breakpoint, kept current as it is resized or turned. */
export const useBreakpoint = (): Breakpoint => breakpointOf(useWindowDimensions().width);

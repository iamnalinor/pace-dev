import { useBreakpoint } from "./use-breakpoint.ts";

/** True on a wide window (`expanded`, ≥ 1024): sidebar navigation, list and detail side by side. */
export const useIsWide = (): boolean => useBreakpoint() === "expanded";

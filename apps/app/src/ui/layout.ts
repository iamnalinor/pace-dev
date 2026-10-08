import { useWindowDimensions } from "react-native";

/** From this width (a laptop, a desktop browser) the app shows a sidebar and side-by-side panes. */
export const WIDE_MIN_WIDTH = 1024;

/** True on a wide window: sidebar navigation, list and detail side by side. */
export const useIsWide = (): boolean => useWindowDimensions().width >= WIDE_MIN_WIDTH;

import type { RefObject } from "react";
import type { ScrollView } from "react-native";

/** The wheel is a mouse's; a touch screen scrolls by hand (see `use-wheel-scroll.web.ts`). */
export const useWheelScroll = (_scrollerRef: RefObject<null | ScrollView>): void => {
  // Nothing to do without a wheel.
};

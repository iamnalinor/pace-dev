import type { ViewStyle } from "react-native";

/** react-native-web draws a 20 px switch by default: under the 24 px minimum target. */
export const SWITCH_STYLE: undefined | ViewStyle = { height: 24 };

/**
How far a click or a tap may land above and below the 24 px switch and still flip it: a 44 px
target (QA round 18 L6) without a taller drawing.
*/
export const SWITCH_REACH_PX: null | number = 10;

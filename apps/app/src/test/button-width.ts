import type { screen } from "@testing-library/react-native";

import { type StyleProp, StyleSheet, type ViewStyle } from "react-native";

type Rendered = NonNullable<typeof screen.root>;

/**
Whether a button keeps to its text's width (`Button`'s `auto` on a computer's window) rather than
taking its container's: the layout jest cannot measure, read from the style it was given.
*/
export const isAtTextWidth = (button: Rendered): boolean => {
  // A button without a style of its own flattens to nothing.
  const flat = StyleSheet.flatten(button.props["style"] as StyleProp<ViewStyle>) as
    | undefined
    | ViewStyle;
  return flat?.alignSelf === "flex-start" && flat.width !== "100%";
};

import type { ReactNode } from "react";

import { Pressable, Text } from "react-native";

import type { ProjectColorName } from "@pace/core";

import { inkClass, PROJECT_FILL, washClass } from "./color.tsx";
import { cx } from "./cx.ts";

const chipFill = (color: null | ProjectColorName, isSelected: boolean): string => {
  if (color === null) {
    return isSelected ? "bg-inverse" : "border border-line";
  }
  return isSelected ? PROJECT_FILL[color] : `border ${washClass(color)}`;
};

const chipText = (color: null | ProjectColorName, isSelected: boolean): string => {
  if (isSelected) {
    return color === null ? "font-medium text-inverseFg" : "font-medium text-accentFg";
  }
  return color === null ? "text-fg2" : inkClass(color);
};

/** A 32px pill: the project filter and the pickers of the forms. */
export const Chip = ({
  children,
  color = null,
  label,
  leading,
  onPress,
  selected = false,
  tall = false,
}: {
  readonly children: string;
  /** Drawn in this colour: washed, and filled with it once chosen. */
  readonly color?: null | ProjectColorName;
  /** Spoken instead of the visible text when the text alone is ambiguous. */
  readonly label?: string;
  readonly leading?: ReactNode;
  readonly onPress: () => void;
  readonly selected?: boolean;
  /** 36px with 13px text: the time pills of the close sheet. */
  readonly tall?: boolean;
}) => (
  <Pressable
    accessibilityLabel={label ?? children}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    className={cx(
      "flex-row items-center gap-1.5 rounded-pill px-3 active:opacity-80",
      tall ? "h-9" : "h-8",
      chipFill(color, selected),
    )}
    hitSlop={6}
    onPress={onPress}
  >
    {leading}
    <Text className={cx("font-sans text-[12px]", chipText(color, selected))}>{children}</Text>
  </Pressable>
);

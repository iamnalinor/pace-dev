import type { ReactNode } from "react";

import { Pressable, Text, View } from "react-native";

import { inkClass, outlineClass, type TagColor, tintClass } from "./color.tsx";
import { cx } from "./cx.ts";

/**
Unselected: the cell inside a 2px outline (in the chip's hue, else the control outline). Selected:
the hue's tint under its ink; a neutral chip gets the selected fill and a label outline instead —
never a black pill.
*/
const chipFill = (color: null | TagColor, isSelected: boolean): string => {
  if (color === null) {
    return isSelected
      ? "border-2 border-label-primary bg-fill-3"
      : "border-2 border-outline bg-cell";
  }
  return isSelected
    ? `border-2 ${outlineClass(color)} ${tintClass(color)}`
    : `border-2 ${outlineClass(color)} bg-cell`;
};

const chipText = (color: null | TagColor, isSelected: boolean): string => {
  if (color === null) {
    return isSelected ? "font-medium text-label-primary" : "text-label-secondary";
  }
  return isSelected ? cx("font-medium", inkClass(color)) : inkClass(color);
};

/**
A 32px pill (36 when tall): the project filter and the pickers of the forms. The pill sits in
a 44px-tall target that does not take room in the layout, so a thumb never misses it.
*/
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
  readonly color?: null | TagColor;
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
    accessibilityRole="radio"
    aria-checked={selected}
    className={cx("justify-center active:opacity-80", tall ? "-my-1 h-hit-web" : "-my-2 h-hit-web")}
    onPress={onPress}
  >
    <View
      className={cx(
        "flex-row items-center gap-2 rounded-pill px-3",
        tall ? "h-10" : "h-8",
        chipFill(color, selected),
      )}
    >
      {leading}
      <Text className={cx("font-sans text-caption font-normal", chipText(color, selected))}>
        {children}
      </Text>
    </View>
  </Pressable>
);

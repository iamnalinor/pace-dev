import type { ReactNode, Ref } from "react";

import { Pressable, Text, View } from "react-native";

import type { ProjectColorName } from "@pace/core";

import { inkClass, OUTLINE, PROJECT_FILL } from "./color.tsx";
import { cx } from "./cx.ts";

/**
Unselected: the page's surface inside a 2px outline (in the chip's color, else a hairline
gray). Selected: filled with the color; a neutral chip gets the raised surface and an ink
outline instead — never a black pill.
*/
const chipFill = (color: null | ProjectColorName, isSelected: boolean): string => {
  if (color === null) {
    return isSelected ? "border-2 border-fg bg-raised" : "border-2 border-line bg-surface";
  }
  return isSelected
    ? `border-2 ${OUTLINE[color]} ${PROJECT_FILL[color]}`
    : `border-2 ${OUTLINE[color]} bg-surface`;
};

const chipText = (color: null | ProjectColorName, isSelected: boolean): string => {
  if (isSelected) {
    return color === null ? "font-medium text-fg" : "font-medium text-onColor";
  }
  return color === null ? "text-fg2" : inkClass(color);
};

/**
A 32px pill (36 when tall): the project filter and the pickers of the forms. The pill sits in
a 44px-tall target that does not take room in the layout, so a thumb never misses it.
*/
export const Chip = ({
  children,
  color = null,
  label = children,
  leading,
  onPress,
  ref,
  selected = false,
  tabIndex,
  tall = false,
}: {
  readonly children: string;
  /** Drawn in this colour: washed, and filled with it once chosen. */
  readonly color?: null | ProjectColorName;
  /** Spoken instead of the visible text when the text alone is ambiguous. */
  readonly label?: string;
  readonly leading?: ReactNode;
  readonly onPress: () => void;
  /** The pressable itself: for a group that moves focus between its chips, or for focus to be
  moved onto it when the control that held it goes away. */
  readonly ref?: Ref<View> | undefined;
  readonly selected?: boolean;
  /** In a group with one tab stop (`RadioChips`): 0 for the chosen chip, -1 for the others. */
  readonly tabIndex?: -1 | 0;
  /** 36px with 13px text: the time pills of the close sheet. */
  readonly tall?: boolean;
}) => (
  <Pressable
    accessibilityLabel={label}
    accessibilityRole="radio"
    aria-checked={selected}
    className={cx("justify-center active:opacity-80", tall ? "-my-1 h-11" : "-my-1.5 h-11")}
    onPress={onPress}
    ref={ref}
    {...(tabIndex !== undefined && { tabIndex })}
  >
    <View
      className={cx(
        "flex-row items-center gap-1.5 rounded-pill px-3",
        tall ? "h-9" : "h-8",
        chipFill(color, selected),
      )}
    >
      {leading}
      <Text className={cx("font-sans text-[12px]", chipText(color, selected))}>{children}</Text>
    </View>
  </Pressable>
);

/**
A chip that does something rather than being picked ("Start from: Homework" opens a new preset):
a button in the unselected look, every one alike, so none reads as already chosen (QA round 19
L7).
*/
export const ActionChip = ({
  children,
  onPress,
}: {
  readonly children: string;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    className="-my-1.5 h-11 justify-center active:opacity-80"
    onPress={onPress}
  >
    <View className={cx("h-8 flex-row items-center rounded-pill px-3", chipFill(null, false))}>
      <Text className={cx("font-sans text-[12px]", chipText(null, false))}>{children}</Text>
    </View>
  </Pressable>
);

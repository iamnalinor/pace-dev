import type { Ref } from "react";

import { Pressable, Text, View } from "react-native";

import { inkClass, outlineClass, type TagColor } from "./color.tsx";
import { cx } from "./cx.ts";
import { Icon, type IconName } from "./icon.tsx";
import { spacePress } from "./space-press.ts";

/**
Unselected: the cell inside a 2px outline (in the chip's hue, else the control outline). Selected: the
solid accent with its own edge, a step the unselected ring cannot be mistaken for (accent against
the cell is ≥ 3:1 in both themes, WCAG 1.4.11): a 12 % hue tint under the same ring read as "not
chosen" (V2-02). The chip's hue stays in the ring of the ones not chosen.
*/
const chipFill = (color: null | TagColor, isSelected: boolean): string => {
  if (isSelected) {
    return "border-2 border-accent bg-accent";
  }
  return color === null
    ? "border-2 border-outline bg-cell"
    : `border-2 ${outlineClass(color)} bg-cell`;
};

const chipText = (color: null | TagColor, isSelected: boolean): string => {
  if (isSelected) {
    return "font-medium text-accent-on";
  }
  return color === null ? "text-label-secondary" : inkClass(color);
};

/**
A 32px pill (40 when tall): the project filter and the pickers of the forms. The pill sits in
a 48px-tall target (`h-hit`) that does not take room in the layout, so a thumb never misses it:
the negative margin is half the difference (8 or 4), so the layout box is exactly the pill.
*/
export const Chip = ({
  children,
  color = null,
  label = children,
  icon,
  onPress,
  ref,
  selected = false,
  tabIndex,
  tall = false,
}: {
  readonly children: string;
  /** Drawn in this colour: ringed and inked in it; the accent fill marks it once chosen. */
  readonly color?: null | TagColor;
  /** Spoken instead of the visible text when the text alone is ambiguous. */
  readonly label?: string;
  /** An inline icon before the text: `onAccent` on a chosen chip, secondary off it. */
  readonly icon?: IconName | undefined;
  readonly onPress: () => void;
  /** The pressable itself: for a group that moves focus between its chips, or for focus to be
  moved onto it when the control that held it goes away. */
  readonly ref?: Ref<View> | undefined;
  readonly selected?: boolean;
  /** In a group with one tab stop (`RadioChips`): 0 for the chosen chip, -1 for the others. */
  readonly tabIndex?: -1 | 0;
  /** 40px: the time pills of the close sheet. */
  readonly tall?: boolean;
}) => {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      aria-checked={selected}
      className={cx("justify-center active:opacity-80", tall ? "-my-1 h-hit" : "-my-2 h-hit")}
      onPress={onPress}
      ref={ref}
      {...(tabIndex !== undefined && { tabIndex })}
      {...spacePress(onPress)}
    >
      <View
        className={cx(
          "flex-row items-center gap-2 rounded-pill px-3",
          tall ? "h-10" : "h-8",
          chipFill(color, selected),
        )}
        testID="chip-pill"
      >
        {icon === undefined ? null : (
          <Icon name={icon} size="inline" tone={selected ? "onAccent" : "secondary"} />
        )}
        <Text className={cx("font-sans text-caption font-normal", chipText(color, selected))}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
};

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
    className="-my-2 h-hit justify-center active:opacity-80"
    onPress={onPress}
  >
    <View className={cx("h-8 flex-row items-center rounded-pill px-3", chipFill(null, false))}>
      <Text className={cx("font-sans text-caption font-normal", chipText(null, false))}>
        {children}
      </Text>
    </View>
  </Pressable>
);

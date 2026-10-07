import type { ReactNode } from "react";

import { Pressable, Text } from "react-native";

import { cx } from "./cx.ts";

/** A 32px pill: the project filter and the pickers of the forms. */
export const Chip = ({
  children,
  label,
  leading,
  onPress,
  selected = false,
  tall = false,
}: {
  readonly children: string;
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
      selected ? "bg-inverse" : "border border-line",
    )}
    hitSlop={6}
    onPress={onPress}
  >
    {leading}
    <Text
      className={cx("font-sans text-[12px]", selected ? "font-medium text-inverseFg" : "text-fg2")}
    >
      {children}
    </Text>
  </Pressable>
);

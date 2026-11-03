import type { AccessibilityRole, PressableProps as NativePressableProps } from "react-native";

import { useCallback } from "react";

import { type HapticKind, haptic as playHaptic } from "../platform/haptics.ts";
import { cx } from "./cx.ts";

/**
How far the press feedback reaches: `bounded` fills the control's own shape (buttons, rows, chips),
`borderless` spreads past it as a round wash (icon buttons).
*/
export type RippleKind = "borderless" | "bounded";

/** The props the native Pressable takes from the kit's, never from a caller. */
type Owned =
  | "accessibilityRole"
  | "accessibilityState"
  | "android_ripple"
  | "aria-disabled"
  | "aria-selected"
  | "disabled"
  | "onLongPress"
  | "onPress"
  | "role";

/**
The kit's Pressable (spec §4.1.1): React Native's, with the state layer (§3.7) drawn once for
every control. Everything React Native's takes passes through, except what the state layer owns.
*/
export type PressableProps = {
  readonly role: AccessibilityRole;
  /** The name said for it; required when it has no text child (an icon). */
  readonly label?: string | undefined;
  readonly selected?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  /** What the press means to the hand (§3.10): `longPress` plays on the long press, the rest on the press. */
  readonly haptic?: HapticKind | undefined;
  readonly ripple?: RippleKind | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly onLongPress?: (() => void) | undefined;
} & Omit<NativePressableProps, Owned>;

/** What the state layer sets on the native Pressable on both platforms. */
type SharedProps = {
  readonly accessibilityLabel?: string;
  readonly accessibilityRole: AccessibilityRole;
  readonly accessibilityState: { readonly disabled: boolean; readonly selected?: boolean };
  readonly "aria-selected"?: boolean;
  readonly className: string;
  readonly disabled: boolean;
  readonly onLongPress: (() => void) | undefined;
  readonly onPress: () => void;
};

/**
Splits the kit's props into what both platforms hand the native Pressable and the rest, which
passes through untouched. The haptic plays with the press it belongs to, never on press-in, and
never while disabled (the native Pressable fires no press then).
*/
export const usePressableProps = ({
  className,
  disabled = false,
  haptic,
  label,
  onLongPress,
  onPress,
  ripple = "bounded",
  role,
  selected,
  ...rest
}: PressableProps) => {
  const press = useCallback(() => {
    if (haptic !== undefined && haptic !== "longPress") {
      playHaptic(haptic);
    }
    onPress?.();
  }, [haptic, onPress]);
  const longPress = useCallback(() => {
    if (haptic === "longPress") {
      playHaptic(haptic);
    }
    onLongPress?.();
  }, [haptic, onLongPress]);
  const shared: SharedProps = {
    ...(label !== undefined && { accessibilityLabel: label }),
    accessibilityRole: role,
    accessibilityState: { disabled, ...(selected !== undefined && { selected }) },
    // react-native-web reads no accessibilityState: the browser hears `aria-selected`.
    ...(selected !== undefined && { "aria-selected": selected }),
    // Controls never shrink in a row: the text beside them yields (spec §4.1.2).
    className: cx("shrink-0", className),
    disabled,
    onLongPress: onLongPress === undefined ? undefined : longPress,
    onPress: press,
  };
  return { rest, ripple, shared };
};

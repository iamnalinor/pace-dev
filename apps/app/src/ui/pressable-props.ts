import type {
  AccessibilityRole,
  GestureResponderEvent,
  PressableProps as NativePressableProps,
} from "react-native";

import { useCallback } from "react";

import { type HapticKind, haptic as playHaptic } from "../platform/haptics.ts";
import { cx } from "./cx.ts";

/**
How far the press feedback reaches: `bounded` fills the control's own shape (buttons, rows, chips),
`borderless` spreads past it as a round wash (icon buttons).
*/
export type RippleKind = "borderless" | "bounded";

/** The roles ARIA lets say `aria-selected` (React Native knows `tab` of them). */
type SelectableRole = Extract<AccessibilityRole, "gridcell" | "option" | "row" | "tab">;

/** The roles that are checked rather than selected (`aria-checked`). */
type CheckableRole = Extract<AccessibilityRole, "checkbox" | "radio" | "switch">;

const SELECTABLE: ReadonlySet<string> = new Set(["gridcell", "option", "row", "tab"]);
const CHECKABLE: ReadonlySet<string> = new Set(["checkbox", "radio", "switch"]);

/**
The roles a Space press is owed on the web: react-native-web presses only `button` on Space
(bug-lessons class 113), and a button must not get a second one.
*/
export const SPACE_ROLES: ReadonlySet<string> = new Set(["checkbox", "radio", "switch", "tab"]);

/** The props the native Pressable takes from the kit's, never from a caller. */
type Owned =
  | "accessibilityRole"
  | "accessibilityState"
  | "android_ripple"
  | "aria-checked"
  | "aria-disabled"
  | "aria-expanded"
  | "aria-selected"
  | "disabled"
  | "onLongPress"
  | "onPress"
  | "role";

/**
The kit's Pressable (spec §4.1.1): React Native's, with the state layer (§3.7) drawn once for
every control. Everything React Native's takes passes through, except what the state layer owns.
`selected` belongs to a tab (and ARIA's option, row, gridcell); `checked` to a checkbox, a radio
or a switch: the type refuses either on another role, and the markup drops it.
*/
export type PressableProps<R extends AccessibilityRole = AccessibilityRole> = {
  readonly role: R;
  /** The name said for it; required when it has no text child (an icon). */
  readonly label?: string | undefined;
  readonly selected?: (R extends SelectableRole ? boolean : never) | undefined;
  readonly checked?: (R extends CheckableRole ? "mixed" | boolean : never) | undefined;
  readonly disabled?: boolean | undefined;
  /** A control that shows and hides a region (a `Disclosure`'s trigger): `aria-expanded`. */
  readonly expanded?: boolean | undefined;
  /** What the press means to the hand (§3.10): `longPress` plays on the long press, the rest on the press. */
  readonly haptic?: HapticKind | undefined;
  readonly ripple?: RippleKind | undefined;
  /** Takes the press event: a link reads its modifier keys (Ctrl-click opens a new tab). */
  readonly onPress?: ((event: GestureResponderEvent) => void) | undefined;
  readonly onLongPress?: (() => void) | undefined;
} & Omit<NativePressableProps, Owned>;

type State = {
  readonly checked?: "mixed" | boolean;
  readonly disabled: boolean;
  readonly expanded?: boolean;
  readonly selected?: boolean;
};

/** What the state layer sets on the native Pressable on both platforms. */
type SharedProps = {
  readonly accessibilityLabel?: string;
  readonly accessibilityRole: AccessibilityRole;
  readonly accessibilityState: State;
  readonly "aria-checked"?: "mixed" | boolean;
  readonly "aria-expanded"?: boolean;
  readonly "aria-selected"?: boolean;
  readonly className: string;
  readonly disabled: boolean;
  readonly onLongPress: (() => void) | undefined;
  readonly onPress: ((event: GestureResponderEvent) => void) | undefined;
};

/** What a caller asked the role to say, before the role is checked. */
type AskedState = {
  readonly checked: "mixed" | boolean | undefined;
  readonly expanded: boolean | undefined;
  readonly isDisabled: boolean;
  readonly selected: boolean | undefined;
};

/** The state a role may say: selected for a tab, checked for a checkable, nothing else. */
const stateOf = (
  role: AccessibilityRole,
  { checked, expanded, isDisabled, selected }: AskedState,
): State => ({
  disabled: isDisabled,
  ...(expanded !== undefined && { expanded }),
  ...(selected !== undefined && SELECTABLE.has(role) && { selected }),
  ...(checked !== undefined && CHECKABLE.has(role) && { checked }),
});

/**
Splits the kit's props into what both platforms hand the native Pressable and the rest, which
passes through untouched. The haptic plays with the press it belongs to, never on press-in, and
never while disabled (the native Pressable fires no press then). A Pressable with no press and no
long press is not a control: it gets no press, no state layer and no haptic (`isLive`).
*/
export const usePressableProps = <R extends AccessibilityRole>({
  checked,
  className,
  disabled = false,
  expanded,
  haptic,
  label,
  onLongPress,
  onPress,
  ripple = "bounded",
  role,
  selected,
  ...rest
}: PressableProps<R>) => {
  const press = useCallback(
    (event: GestureResponderEvent) => {
      if (haptic !== undefined && haptic !== "longPress") {
        playHaptic(haptic);
      }
      onPress?.(event);
    },
    [haptic, onPress],
  );
  const longPress = useCallback(() => {
    if (haptic === "longPress") {
      playHaptic(haptic);
    }
    onLongPress?.();
  }, [haptic, onLongPress]);
  const state = stateOf(role, { checked, expanded, isDisabled: disabled, selected });
  const shared: SharedProps = {
    ...(label !== undefined && { accessibilityLabel: label }),
    accessibilityRole: role,
    accessibilityState: state,
    // react-native-web reads no accessibilityState: the browser hears the aria attributes.
    ...(state.selected !== undefined && { "aria-selected": state.selected }),
    ...(state.checked !== undefined && { "aria-checked": state.checked }),
    ...(state.expanded !== undefined && { "aria-expanded": state.expanded }),
    // Controls never shrink in a row: the text beside them yields (spec §4.1.2).
    className: cx("shrink-0", className),
    disabled,
    onLongPress: onLongPress === undefined ? undefined : longPress,
    onPress: onPress === undefined ? undefined : press,
  };
  const isLive = onPress !== undefined || onLongPress !== undefined;
  return { isLive, rest, ripple, shared };
};

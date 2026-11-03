import type {
  AccessibilityRole,
  GestureResponderEvent,
  PressableProps as NativePressableProps,
  View,
} from "react-native";

import { type Ref, useCallback } from "react";

import { type HapticKind, haptic as playHaptic } from "../platform/haptics.ts";
import { cx } from "./cx.ts";

/**
How far the press feedback reaches: `bounded` fills the control's own shape (buttons, rows, chips),
`borderless` spreads past it as a round wash (icon buttons).
*/
export type RippleKind = "borderless" | "bounded";

/** A control's corners, as a radius token (spec §3.4): the ripple, the overlay and the ring share them. */
export type Shape = "lg" | "md" | "pill" | "sm" | "xl" | "xs";

const SHAPE_CLASS: Readonly<Record<Shape, string>> = {
  lg: "rounded-lg",
  md: "rounded-md",
  pill: "rounded-pill",
  sm: "rounded-sm",
  xl: "rounded-xl",
  xs: "rounded-xs",
};

/**
The one disabled treatment (spec §3.7, F-COL-13): a disabled control's label drops to
`label.quaternary`, its fill to `fill.1`, its icon to the `quaternary` tone; never an opacity.
*/
export const DISABLED = {
  fill: "bg-fill-1",
  icon: "quaternary",
  label: "text-label-quaternary",
} as const;

/** The roles ARIA lets say `aria-selected` (React Native knows `tab` of them). */
type SelectableRole = Extract<AccessibilityRole, "gridcell" | "option" | "row" | "tab">;

/** The roles that are checked rather than selected (`aria-checked`). */
type CheckableRole = Extract<AccessibilityRole, "checkbox" | "radio" | "switch">;

/** The roles ARIA lets say `aria-expanded` that React Native knows. */
type ExpandableRole = Extract<
  AccessibilityRole,
  "button" | "combobox" | "link" | "menuitem" | "tab"
>;

const EXPANDABLE: ReadonlySet<string> = new Set(["button", "combobox", "link", "menuitem", "tab"]);

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
  readonly expanded?: (R extends ExpandableRole ? boolean : never) | undefined;
  /** What the press means to the hand (§3.10): `longPress` plays on the long press, the rest on the press. */
  readonly haptic?: HapticKind | undefined;
  readonly ripple?: RippleKind | undefined;
  /** The corners (a radius token): of the control, or of its `visual` when it has one. */
  readonly shape?: Shape | undefined;
  /**
  The drawn box when it is smaller than the target (a 32 chip, a 24 check, a 36 small button): its
  classes. The Pressable is then the target itself (48 dp / 44 px, transparent, the layout box, no
  negative margin) and centres this box, which carries the shape, the press overlay and the focus
  ring (the small-visual pattern; Task 3.2 re-review N1). Without it the control's own box is drawn,
  at least as large as the target.
  */
  readonly visual?: string | undefined;
  /** Takes the press event: a link reads its modifier keys (Ctrl-click opens a new tab). */
  readonly onPress?: ((event: GestureResponderEvent) => void) | undefined;
  readonly onLongPress?: (() => void) | undefined;
  /** The control itself: for focus to be moved onto it, or a group to move focus between its own. */
  readonly ref?: Ref<View> | undefined;
} & Omit<NativePressableProps, Owned>;

type State = {
  readonly checked?: "mixed" | boolean;
  readonly disabled: boolean;
  readonly expanded?: boolean;
  readonly selected?: boolean;
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
  ...(expanded !== undefined && EXPANDABLE.has(role) && { expanded }),
  ...(selected !== undefined && SELECTABLE.has(role) && { selected }),
  ...(checked !== undefined && CHECKABLE.has(role) && { checked }),
});

const shapeClass = (shape: Shape | undefined): string | undefined =>
  shape === undefined ? undefined : SHAPE_CLASS[shape];

/** The drawn box of a small visual, with the corners; `undefined` without one. */
const visualClass = (visual: string | undefined, shape: Shape | undefined): string | undefined =>
  visual === undefined ? undefined : cx(visual, shapeClass(shape));

/**
The target's classes. Controls never shrink in a row: the text beside them yields (spec §4.1.2).
The target of a small visual centres it; the corners go on the visual, else on the control.
*/
const targetClass = (
  className: string | undefined,
  { shape, visual }: { readonly shape: Shape | undefined; readonly visual: string | undefined },
): string =>
  visual === undefined
    ? cx("shrink-0", shapeClass(shape), className)
    : cx("shrink-0 items-center justify-center", shapeClass(shape), className);

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
  shape,
  visual,
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
  const state = stateOf(role, { checked, expanded, isDisabled: disabled, selected });
  const shared: SharedProps = {
    ...(label !== undefined && { accessibilityLabel: label }),
    accessibilityRole: role,
    accessibilityState: state,
    // react-native-web reads no accessibilityState: the browser hears the aria attributes.
    ...(state.selected !== undefined && { "aria-selected": state.selected }),
    ...(state.checked !== undefined && { "aria-checked": state.checked }),
    ...(state.expanded !== undefined && { "aria-expanded": state.expanded }),
    className: targetClass(className, { shape, visual }),
    disabled,
    onLongPress: onLongPress === undefined ? undefined : longPress,
    onPress: onPress === undefined ? undefined : press,
  };
  const isLive = onPress !== undefined || onLongPress !== undefined;
  return { inner: visualClass(visual, shape), isLive, rest, ripple, shared };
};

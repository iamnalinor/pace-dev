import {
  type AccessibilityRole,
  type GestureResponderEvent,
  Pressable as NativePressable,
} from "react-native";

import type { SpacePress } from "./space-press.ts";

import { cx } from "./cx.ts";
import { type PressableProps, SPACE_ROLES, usePressableProps } from "./pressable-props.ts";
import { inVisual } from "./pressable-visual.tsx";
import { spacePress } from "./space-press.web.ts";

export type { PressableProps } from "./pressable-props.ts";

/** The web's target (spec §3.7, `size.hitWeb`): a control is never smaller, whatever it draws. */
const TARGET = "min-h-hit-web min-w-hit-web";

type PressHandler = ((event: GestureResponderEvent) => void) | undefined;

type KeyEvent = Parameters<NonNullable<SpacePress["onKeyDown"]>>[0] & {
  readonly isDefaultPrevented?: () => boolean;
};

/**
Space for a tab, a checkbox, a radio and a switch (bug-lessons class 113), with the disabled gate in
one place. A caller's own key handler runs first; if it already pressed on Space (an older caller
that still spreads `spacePress` prevents the key's default), the press is not repeated. The key
event stands in for the press event: these roles never read a pointer's modifiers.
*/
const spaceKey = (
  role: AccessibilityRole,
  callerKeyDown: ((event: KeyEvent) => void) | undefined,
  { isDisabled, onPress }: { readonly isDisabled: boolean; readonly onPress: PressHandler },
): ((event: KeyEvent) => void) | undefined => {
  if (!SPACE_ROLES.has(role)) {
    return callerKeyDown;
  }
  return (event) => {
    callerKeyDown?.(event);
    if (event.isDefaultPrevented?.() === true) {
      return;
    }
    const press =
      onPress === undefined
        ? undefined
        : () => {
            onPress(event as unknown as GestureResponderEvent);
          };
    spacePress(press, isDisabled).onKeyDown?.(event);
  };
};

/**
The web's Pressable: the state layer is CSS on the element's `::after` (`global.css`,
`[data-pace-press]`): hover `fill.1` only for a hovering pointer, the pressed `fill.2` overlay by
`:active` (in at once, out `duration.xs`), the `focus` ring by `:focus-visible`. None of it waits
for React. A Pressable with nothing to do gets no mark, so no hover or press. `delayPressIn: 0`:
react-native-web otherwise holds press-in back 50 ms.
*/
export const Pressable = <R extends AccessibilityRole>(props: PressableProps<R>) => {
  const { inner, isLive, rest, ripple, shared } = usePressableProps(props);
  const { onKeyDown: callerKeyDown, ...others } = rest as typeof rest & {
    readonly onKeyDown?: (event: KeyEvent) => void;
  };
  const onKeyDown = spaceKey(props.role, callerKeyDown, {
    isDisabled: shared.disabled,
    onPress: shared.onPress,
  });
  return (
    <NativePressable
      {...others}
      {...(inner !== undefined && {
        children: inVisual(others.children, inner, { dataSet: { paceVisual: "true" } }),
      })}
      {...shared}
      className={cx(TARGET, shared.className)}
      // react-native-web's props React Native's types do not know: `dataSet` becomes a `data-*`
      // attribute, `delayPressIn` its press-in delay (50 ms unless told), `onKeyDown` a key handler.
      // A small visual (`data-pace-inner`) takes the overlay and the ring off the target.
      {...({
        delayPressIn: 0,
        ...(isLive && {
          dataSet: { pacePress: ripple, ...(inner !== undefined && { paceInner: "true" }) },
        }),
        ...(onKeyDown !== undefined && { onKeyDown }),
      } as object)}
    />
  );
};

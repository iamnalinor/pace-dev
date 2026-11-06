import { type AccessibilityRole, Pressable as NativePressable } from "react-native";

import { cx } from "./cx.ts";
import { type PressableProps, usePressableProps } from "./pressable-props.ts";
import { inVisual } from "./pressable-visual.tsx";
import { useTheme } from "./theme-provider.tsx";

export type { PressableProps } from "./pressable-props.ts";

/**
Every control's press, focus and selected state, drawn once (spec §3.7, §4.1.1). On Android the
platform draws the ripple in `fill.3` over the content the moment the finger lands, without a
React render; `borderless` spreads it past the control (icon buttons). A Pressable with nothing to
do does not ripple. The web build swaps in `pressable.web.tsx`, whose feedback is CSS.
*/
/** The phone's target (spec §3.7, `size.hit`): a control is never smaller, whatever it draws. */
const TARGET = "min-h-hit min-w-hit";

export const Pressable = <R extends AccessibilityRole>(props: PressableProps<R>) => {
  const { palette } = useTheme();
  const { inner, isLive, rest, ripple, shared } = usePressableProps(props);
  return (
    <NativePressable
      {...rest}
      {...(inner !== undefined && { children: inVisual(rest.children, inner, {}) })}
      {...shared}
      className={cx(TARGET, shared.className)}
      {...(isLive && {
        android_ripple: {
          borderless: ripple === "borderless",
          color: palette["fill.3"],
          foreground: true,
        },
      })}
    />
  );
};

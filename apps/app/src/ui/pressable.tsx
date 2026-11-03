import { Pressable as NativePressable } from "react-native";

import { type PressableProps, usePressableProps } from "./pressable-props.ts";
import { useTheme } from "./theme-provider.tsx";

export type { PressableProps } from "./pressable-props.ts";

/**
Every control's press, focus and selected state, drawn once (spec §3.7, §4.1.1). On Android the
platform draws the ripple in `fill.3` over the content the moment the finger lands, without a
React render; `borderless` spreads it past the control (icon buttons). The web build swaps in
`pressable.web.tsx`, whose feedback is CSS.
*/
export const Pressable = (props: PressableProps) => {
  const { palette } = useTheme();
  const { rest, ripple, shared } = usePressableProps(props);
  return (
    <NativePressable
      {...rest}
      {...shared}
      android_ripple={{
        borderless: ripple === "borderless",
        color: palette["fill.3"],
        foreground: true,
      }}
    />
  );
};

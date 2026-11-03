import { Pressable as NativePressable } from "react-native";

import { type PressableProps, usePressableProps } from "./pressable-props.ts";

export type { PressableProps } from "./pressable-props.ts";

/**
The web's Pressable: the state layer is CSS on the element (`global.css`, `[data-pace-press]`):
hover `fill.1` only for a hovering pointer, the pressed `fill.2` overlay by `:active` (in at
once, out `duration.xs`), the `focus` ring by `:focus-visible`. None of it waits for React.
`delayPressIn: 0`: react-native-web otherwise holds press-in back 50 ms.
*/
export const Pressable = (props: PressableProps) => {
  const { rest, ripple, shared } = usePressableProps(props);
  return (
    <NativePressable
      {...rest}
      {...shared}
      // react-native-web's props React Native's types do not know: `dataSet` becomes a `data-*`
      // attribute, `delayPressIn` its press-in delay (50 ms unless told).
      {...({ dataSet: { pacePress: ripple }, delayPressIn: 0 } as object)}
    />
  );
};

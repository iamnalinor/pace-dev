import { type PressableProps as NativePressableProps, View } from "react-native";

type Children = NativePressableProps["children"];

/**
The small-visual pattern (`PressableProps.visual`): the drawn box inside the transparent target.
`mark` is what the platform adds to it (the web's `data-pace-visual`, which `global.css` draws the
overlay and the ring on). A child that is a function of the press state keeps getting it.
*/
export const inVisual = (children: Children, className: string, mark: object): Children =>
  typeof children === "function" ? (
    (state) => (
      <View className={className} testID="pressable-visual" {...mark}>
        {children(state)}
      </View>
    )
  ) : (
    <View className={className} testID="pressable-visual" {...mark}>
      {children}
    </View>
  );

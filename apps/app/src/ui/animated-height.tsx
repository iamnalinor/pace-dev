import { type ReactNode, useState } from "react";
import { View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/** Long enough to see the card change shape, short enough not to wait for it. */
const DURATION_MS = 220;

const CLIP = { overflow: "hidden" } as const;

/**
A box whose height follows its content smoothly: when what is inside changes (a line becomes a
form, a form folds back to a line), the box grows or shrinks to the new height instead of
jumping. The first height is taken as it is. Reduced motion makes it instant.
*/
export const AnimatedHeight = ({ children }: { readonly children: ReactNode }) => {
  const [isMeasured, setIsMeasured] = useState(false);
  const height = useSharedValue(0);
  const style = useAnimatedStyle(() => (isMeasured ? { height: height.get() } : {}));
  return (
    <Animated.View style={[CLIP, style]}>
      <View
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          if (isMeasured) {
            height.set(
              withTiming(next, { duration: DURATION_MS, reduceMotion: ReduceMotion.System }),
            );
          } else {
            height.set(next);
            setIsMeasured(true);
          }
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
};

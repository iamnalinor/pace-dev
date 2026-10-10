import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { cx } from "./cx.ts";

const BREATH_MS = 900;

/** A small dot that breathes while something runs (still under reduced motion). */
export const PulseDot = ({ className }: { readonly className: string }) => {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.3, { duration: BREATH_MS, reduceMotion: ReduceMotion.System }),
      -1,
      true,
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  // The class names sit on a plain view: reanimated views drop them on the web.
  return (
    <Animated.View style={style}>
      <View className={cx("h-2 w-2 rounded-full", className)} />
    </Animated.View>
  );
};

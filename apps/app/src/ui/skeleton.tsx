import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { cx } from "./cx.ts";
import { PLACEHOLDER_BREATH } from "./motion.ts";

/** The rows' text widths vary a little, so the placeholder reads as a list, not a grid. */
const NAME_WIDTHS = ["w-32", "w-20", "w-24"] as const;
const META_WIDTHS = ["w-24", "w-32", "w-20"] as const;

/**
Grey rows standing in for a list while it loads (an icon, a name and a line under it), breathing
unless the system asks for reduced motion. Screen readers hear `label` once, not the bars.
*/
export const Skeleton = ({
  label,
  rows = 3,
}: {
  readonly label: string;
  readonly rows?: number;
}) => {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.45, PLACEHOLDER_BREATH), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" accessible>
      {/* The class names sit on plain views: reanimated views drop them on the web. */}
      <Animated.View style={style}>
        <View className="gap-1">
          {Array.from({ length: rows }, (_, index) => (
            <View className="min-h-row flex-row items-center gap-3 py-2" key={index}>
              <View className="h-8 w-8 rounded-pill bg-fill-4" />
              <View className="flex-1 gap-2">
                <View
                  className={cx(
                    "h-4 rounded-pill bg-fill-4",
                    NAME_WIDTHS[index % NAME_WIDTHS.length],
                  )}
                />
                <View
                  className={cx(
                    "h-3 rounded-pill bg-fill-4",
                    META_WIDTHS[index % META_WIDTHS.length],
                  )}
                />
              </View>
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
};

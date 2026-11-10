import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { PLACEHOLDER_DIM } from "@pace/core";

import { cx } from "./cx.ts";
import { PLACEHOLDER_BREATH } from "./motion.ts";
import { SKELETON_DELAY_MS, useIsShownAfter } from "./use-shown-after.ts";

/** What the skeleton stands in for, in the final layout's own shapes (spec §4.2.23). */
export type SkeletonShape = "listRow" | "row" | "text";

/** The rows' text widths vary a little, so the placeholder reads as a list, not a grid. */
const NAME_WIDTHS = ["w-32", "w-20", "w-24"] as const;
const META_WIDTHS = ["w-24", "w-32", "w-20"] as const;
const LINE_WIDTHS = ["w-full", "w-full", "w-1/2"] as const;

/**
The bars are `label.quaternary`: they stand out from `bg.app` and `bg.cell` at 1.5:1 even at the
dim of their breath (QA 19 L2; `contrast.test.ts` "placeholder rows"). The spec's `fill.3` would
not (a translucent fill on the page is under 1.2:1).
*/
const BAR = "rounded-pill bg-label-quaternary";

const Bars = ({ index, shape }: { readonly index: number; readonly shape: SkeletonShape }) => {
  if (shape === "text") {
    return <View className={cx("h-3", BAR, LINE_WIDTHS[index % LINE_WIDTHS.length])} />;
  }
  const name = NAME_WIDTHS[index % NAME_WIDTHS.length];
  const meta = META_WIDTHS[index % META_WIDTHS.length];
  return (
    <View className="min-h-row flex-row items-center gap-3 py-2">
      <View className={cx(shape === "row" ? "size-6" : "size-5", BAR)} />
      <View className="flex-1 gap-2">
        <View className={cx("h-3", BAR, name)} />
        {shape === "row" ? <View className={cx("h-2", BAR, meta)} /> : null}
      </View>
      {shape === "listRow" ? <View className={cx("h-3 w-12", BAR)} /> : null}
    </View>
  );
};

/**
Grey shapes standing in for what loads (spec §4.2.23): `row` a task row (a 24 circle, a title bar
and a meta bar at the row's height), `listRow` a settings or device row (an icon, a title, a
trailing value), `text` a paragraph. The region is a progress bar named once by `label` and keeps
its height from the first frame, so nothing shifts; its bars show only after 300 ms of waiting (a
fast load shows nothing) and breathe, still under reduced motion.
*/
export const Skeleton = ({
  label,
  rows = 3,
  shape = "row",
}: {
  readonly label: string;
  readonly rows?: number;
  readonly shape?: SkeletonShape;
}) => {
  const isShown = useIsShownAfter(SKELETON_DELAY_MS);
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(PLACEHOLDER_DIM, PLACEHOLDER_BREATH), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessible
      aria-busy
      testID="skeleton"
    >
      {/* The class names sit on plain views: reanimated views drop them on the web. */}
      <Animated.View style={style}>
        <View
          className={shape === "text" ? "gap-2" : "gap-1"}
          style={{ opacity: isShown ? 1 : 0 }}
          testID="skeleton-bars"
        >
          {Array.from({ length: rows }, (_, index) => (
            <Bars index={index} key={index} shape={shape} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
};

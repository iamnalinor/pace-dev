import { View } from "react-native";
import Animated from "react-native-reanimated";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";

import type { DayRail as DayRailModel, RailBar } from "@pace/client";

import { clockTime } from "#app/format/time.ts";
import { cx } from "#app/ui/cx.ts";
import { outlineClass, tintClass } from "#app/ui/hue.ts";
import { ROW_LAYOUT } from "#app/ui/motion.ts";
import { Text } from "#app/ui/text.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { space, z } from "@pace/core";

/** The dot grid's pitch: the page's ruling (spec §2 A). */
const PITCH = space["4"];

/** The faint dot grid of the notebook page, behind the rail only. */
const DotGrid = () => {
  const { palette } = useTheme();
  return (
    <Svg height="100%" width="100%">
      <Defs>
        <Pattern height={PITCH} id="grid" patternUnits="userSpaceOnUse" width={PITCH}>
          <Circle cx={PITCH / 2} cy={PITCH / 2} fill={palette.grid} r={1} />
        </Pattern>
      </Defs>
      <Rect fill="url(#grid)" height="100%" width="100%" />
    </Svg>
  );
};

/** Where a row of the timeline was laid out, in the list's own coordinates. */
export type RowFrame = { readonly top: number; readonly height: number };

/** The rows' frames by row key, as each row reports its layout. */
export type RowFrames = Readonly<Record<string, RowFrame>>;

/**
One bar, at its row's own top and height: a block in its category's tint with a 1 px pen line in
its stroke at the top; a gap dashed, with no hue; a parallel block narrower, beside the main line.
A row that was not shown when the day opened slides like its row (`ROW_LAYOUT`).
*/
const Bar = ({
  bar,
  frame,
  isStill,
}: {
  readonly bar: RailBar;
  readonly frame: RowFrame;
  readonly isStill: boolean;
}) => {
  const style = { height: frame.height, top: frame.top } as const;
  const motion = isStill ? {} : { layout: ROW_LAYOUT };
  if (bar.kind === "gap" || bar.hue === null) {
    return (
      <Animated.View
        {...motion}
        className="absolute left-1 w-3 rounded-xs border border-dashed border-outline"
        style={style}
        testID="rail-bar"
      />
    );
  }
  return (
    <Animated.View
      {...motion}
      className={cx(
        "absolute overflow-hidden rounded-xs",
        bar.kind === "parallel" ? "left-5 w-2" : "left-1 w-3",
        tintClass(bar.hue),
      )}
      style={style}
      testID="rail-bar"
    >
      <View
        className={cx("absolute inset-x-0 top-0 border-t", outlineClass(bar.hue))}
        testID="rail-pen"
      />
    </Animated.View>
  );
};

/**
The notebook page's rail (spec §2 A, Task 7.1; owner 2026-11-09: it lines up with the rows): a faint
dot grid and, on it, one bar beside each row at that row's measured top and height, so a bar and
its row never part whatever the row's height. A row not measured yet has no bar rather than a
guessed one. The rows carry the meaning (their text says the times), so the rail is hidden from
screen readers and takes no touches.
*/
export const DayRail = ({
  frames,
  rail,
  still,
}: {
  readonly frames: RowFrames;
  readonly rail: DayRailModel;
  /** The keys the day opened with: their bars do not slide. */
  readonly still?: ReadonlySet<string>;
}) =>
  rail.bars.length === 0 ? null : (
    <View
      accessibilityElementsHidden
      className="absolute inset-y-0 left-0 w-8 overflow-hidden rounded-md"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID="day-rail"
    >
      <View className="absolute inset-0">
        <DotGrid />
      </View>
      {rail.bars.map((bar) => {
        const frame = frames[bar.key];
        return frame === undefined ? null : (
          <Bar bar={bar} frame={frame} isStill={still?.has(bar.key) ?? true} key={bar.key} />
        );
      })}
    </View>
  );

/**
Now on the page: the red margin line (`status.danger`, 1 px) across the timeline with a dot at the
rail and the time in `caption` (spec §2 A), inside the row whose time holds now and as far down it
as now is into that time: at the running row's bottom, where its bar ends. Static, no pulse; hidden from screen readers (the
running row says what is now).
*/
export const NowMargin = ({
  frames,
  now,
  rail,
  zone,
}: {
  readonly frames: RowFrames;
  readonly now: string;
  readonly rail: DayRailModel;
  readonly zone: string;
}) => {
  const frame = rail.now === null ? undefined : frames[rail.now.key];
  if (frame === undefined || rail.now === null) {
    return null;
  }
  return (
    <View
      accessibilityElementsHidden
      className="absolute inset-x-0 flex-row items-center"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ top: frame.top + frame.height * rail.now.at, zIndex: z.sticky }}
      testID="now-margin"
    >
      <View className="ml-3 h-2 w-2 rounded-pill bg-danger" />
      <View className="flex-1 border-t border-danger" />
      <Text className="bg-app px-1" numeric role="caption" tone="danger">
        {clockTime(now, zone)}
      </Text>
    </View>
  );
};

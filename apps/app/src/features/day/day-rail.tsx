import { View } from "react-native";
import Svg, { Circle, Defs, Line, Pattern, Rect } from "react-native-svg";

import type { DayRail as DayRailModel, RailItem } from "@pace/client";

import { clockTime } from "#app/format/time.ts";
import { cx } from "#app/ui/cx.ts";
import { outlineClass, tintClass } from "#app/ui/hue.ts";
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

/** 45° hatching where two blocks overlap: drawn in the quiet label tone, never red. */
const Hatch = () => {
  const { palette } = useTheme();
  return (
    <Svg height="100%" width="100%">
      <Defs>
        <Pattern
          height={space["1"]}
          id="hatch"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
          width={space["1"]}
        >
          <Line
            stroke={palette["label.tertiary"]}
            strokeWidth={1}
            x1={0}
            x2={0}
            y1={0}
            y2={space["1"]}
          />
        </Pattern>
      </Defs>
      <Rect fill="url(#hatch)" height="100%" width="100%" />
    </Svg>
  );
};

/** A position on the rail as a share of its length, so the rail needs no measuring. */
const percent = (value: number, total: number): `${number}%` => `${(value / total) * 100}%`;

const MIDDLE = { top: "50%" } as const;
const TILT = { transform: [{ rotate: "45deg" }] } as const;

/** Two short 45° ticks across a gap that is drawn shorter than it was. */
const ScaleBreak = () => (
  <View className="absolute inset-x-0 items-center" style={MIDDLE} testID="rail-scale-break">
    <View className="w-3 border-t border-label-quaternary" style={TILT} />
    <View className="mt-1 w-3 border-t border-label-quaternary" style={TILT} />
  </View>
);

/** One band: a block's tint with its pen line at the start; a gap dashed; a parallel one narrower. */
const Band = ({ item, total }: { readonly item: RailItem; readonly total: number }) => {
  const frame = {
    height: percent(item.to - item.from, total),
    top: percent(item.from, total),
  } as const;
  if (item.kind === "gap" || item.hue === null) {
    return (
      <View
        className="absolute left-1 w-3 rounded-xs border border-dashed border-outline"
        style={frame}
        testID="rail-gap"
      >
        {item.scaleBreak ? <ScaleBreak /> : null}
      </View>
    );
  }
  return (
    <View
      className={cx(
        "absolute overflow-hidden rounded-xs",
        item.kind === "parallel" ? "left-5 w-2" : "left-1 w-3",
        tintClass(item.hue),
      )}
      style={frame}
      testID={`rail-${item.kind}`}
    >
      {/* The pen line: 1 px in the category's stroke at the band's leading edge. */}
      <View className={cx("absolute inset-x-0 top-0 border-t", outlineClass(item.hue))} />
      {item.overlap === null ? null : (
        <View
          className="absolute inset-x-0"
          style={{
            height: percent(item.overlap.to - item.overlap.from, item.to - item.from),
            top: percent(item.overlap.from - item.from, item.to - item.from),
          }}
          testID="rail-overlap"
        >
          <Hatch />
        </View>
      )}
    </View>
  );
};

/**
The notebook page's rail (spec §2 A, Task 7.1), beside the editable rows: a faint dot grid and, on
it, a band per block in its category's tint with a 1 px pen line at its start, a dashed band per
gap (with a break in the scale where a long gap was cut short), a narrower band beside the main
one for a parallel block, and hatching where blocks overlap. It is an index: the rows carry the
meaning, so the rail is hidden from screen readers and takes no touches.
*/
export const DayRail = ({ rail }: { readonly rail: DayRailModel }) =>
  rail.items.length === 0 ? null : (
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
      {rail.items.map((item) => (
        <Band item={item} key={`${item.kind}-${String(item.from)}`} total={rail.total} />
      ))}
    </View>
  );

/**
Now on the page: the red margin line (`status.danger`, 1 px) across the timeline with a dot at the
rail and the time in `caption` (spec §2 A). Static, no pulse; hidden from screen readers (the
running row says what is now).
*/
export const NowMargin = ({
  now,
  rail,
  zone,
}: {
  readonly now: string;
  readonly rail: DayRailModel;
  readonly zone: string;
}) =>
  rail.nowAt === null ? null : (
    <View
      accessibilityElementsHidden
      className="absolute inset-x-0 flex-row items-center"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ top: percent(rail.nowAt, rail.total), zIndex: z.sticky }}
      testID="now-margin"
    >
      <View className="ml-3 h-2 w-2 rounded-pill bg-danger" />
      <View className="flex-1 border-t border-danger" />
      <Text className="bg-app px-1" numeric role="caption" tone="danger">
        {clockTime(now, zone)}
      </Text>
    </View>
  );

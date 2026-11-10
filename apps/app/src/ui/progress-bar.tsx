import { View } from "react-native";

import { cx } from "./cx.ts";
import { fillClass, type TagColor } from "./hue.ts";

const PERCENT = 100;

const clamped = (fraction: number): number => Math.min(Math.max(fraction, 0), 1);

/** What the fill is drawn in: a task's progress, an activity's category, or past its Expect. */
export type ProgressTone = "primary" | "warn" | { readonly hue: TagColor };

const fillOf = (tone: ProgressTone): string => {
  if (tone === "primary") {
    return "bg-label-primary";
  }
  return tone === "warn" ? "bg-warn" : fillClass(tone.hue);
};

/**
The one bar (spec §4.2.13): a 4 high `fill.4` pill track, the fill in `label.primary` (a task's
progress), a hue's stroke (the running activity) or `status.warn` (past the Expect). Values clamp to
0–100 %. A progress bar to assistive tech, its value said as the percent the screen shows.
*/
export const ProgressBar = ({
  label,
  tone = "primary",
  value,
  valueText,
}: {
  readonly label: string;
  readonly tone?: ProgressTone;
  /** 0..1. */
  readonly value: number;
  /** The value as the screen says it («30 %»); the percent without it. */
  readonly valueText?: string | undefined;
}) => {
  const percent = Math.round(clamped(value) * PERCENT);
  const said = valueText ?? `${String(percent)}%`;
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: PERCENT, min: 0, now: percent, text: said }}
      accessible
      aria-valuemax={PERCENT}
      aria-valuemin={0}
      aria-valuenow={percent}
      {...{ "aria-valuetext": said }}
      className="h-1 overflow-hidden rounded-pill bg-fill-4"
    >
      <View
        className={cx("h-1 rounded-pill", fillOf(tone))}
        style={{ width: `${percent}%` }}
        testID="progress-fill"
      />
    </View>
  );
};

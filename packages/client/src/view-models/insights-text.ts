import { formatDuration, type Fragmentation, type Language } from "@pace/core";

import type { InsightsModel } from "./insights.ts";

/** "09:00" for an hour of the day (24 wraps to 00:00). */
export const hourLabel = (hour: number): string => `${String(hour % 24).padStart(2, "0")}:00`;

/** Hours named under the by-hour chart. */
export const HOUR_TICKS: readonly number[] = [0, 6, 12, 18];

export type FragmentationTile = {
  readonly key: "insights.medianBlock" | "insights.shortShare" | "insights.switches";
  readonly value: string;
};

const DASH = "—";

/** The three headline numbers of the fragmentation card; `null` when nothing was tracked. */
export const fragmentationTiles = (
  fragmentation: Fragmentation,
  language: Language,
): null | readonly FragmentationTile[] => {
  const { medianFocusMinutes, shortFocusShare, switchesPerDay } = fragmentation;
  if (medianFocusMinutes === null && switchesPerDay === null) {
    return null;
  }
  return [
    {
      key: "insights.medianBlock",
      value:
        medianFocusMinutes === null
          ? DASH
          : formatDuration(Math.round(medianFocusMinutes), language),
    },
    {
      key: "insights.shortShare",
      value: shortFocusShare === null ? DASH : `${String(Math.round(shortFocusShare * 100))}%`,
    },
    {
      key: "insights.switches",
      value: switchesPerDay === null ? DASH : switchesPerDay.toFixed(1),
    },
  ];
};

export type FocusSleepRow = InsightsModel["focusSleep"][number] & {
  readonly weekday: string;
  /** `null` when no sleep was logged for the night before. */
  readonly sleepText: null | string;
  readonly focusText: string;
};

/** The sleep-and-focus rows with their texts; `null` when no night was logged all week. */
export const focusSleepRows = (
  days: InsightsModel["focusSleep"],
  { language, zone }: { readonly language: Language; readonly zone: string },
): null | readonly FocusSleepRow[] => {
  if (days.every((day) => day.sleepMinutes === null)) {
    return null;
  }
  const weekday = new Intl.DateTimeFormat(language, { timeZone: zone, weekday: "short" });
  return days.map((day) => ({
    ...day,
    focusText: formatDuration(day.focusMinutes, language),
    sleepText: day.sleepMinutes === null ? null : formatDuration(day.sleepMinutes, language),
    weekday: weekday.format(new Date(day.date)),
  }));
};

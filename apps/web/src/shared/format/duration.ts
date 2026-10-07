import { formatDuration, type Language, t } from "@pace/core";

import { formatCount } from "./plural.ts";

const MINUTES_PER_DAY = 24 * 60;
/** From half a day on, lateness reads in whole days ("due yesterday" → "1 day late"). */
const LATE_DAYS_FROM_MINUTES = 12 * 60;

/** `100` → `1h 40m`; `~1h 40m` when the figure is an estimate. */
export const formatMinutes = (
  minutes: number,
  language: Language,
  { approx = false }: { readonly approx?: boolean } = {},
): string => `${approx ? "~" : ""}${formatDuration(minutes, language)}`;

/** How late a task is: the duration under half a day, whole days (rounded up) after. */
export const formatLate = (minutes: number, language: Language): string =>
  minutes < LATE_DAYS_FROM_MINUTES
    ? t(language, "meta.lateBy", { duration: formatDuration(minutes, language) })
    : formatCount(language, Math.ceil(minutes / MINUTES_PER_DAY), "meta.lateDays");

/** "12 days old" for a task that waits without a deadline. */
export const formatAge = (days: number, language: Language): string =>
  formatCount(language, days, "meta.age");

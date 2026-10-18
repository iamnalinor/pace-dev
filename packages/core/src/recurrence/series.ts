import { tz } from "@date-fns/tz";
import {
  addBusinessDays,
  differenceInBusinessDays,
  differenceInCalendarDays,
  differenceInCalendarMonths,
} from "date-fns";

import { addDaysIn, formatInZone, wallClockInstant } from "../time.ts";

/** A task series has its own schedule, independent of any preset. */
export type SeriesSchedule =
  | { readonly kind: "daily"; readonly until?: string | undefined }
  | { readonly kind: "every_n_days"; readonly days: number; readonly until?: string | undefined }
  | { readonly kind: "monthly"; readonly until?: string | undefined }
  | { readonly kind: "weekdays"; readonly until?: string | undefined }
  | { readonly kind: "weekly"; readonly until?: string | undefined };

export type SeriesSlot = { readonly index: number; readonly at: string };

/** A last repeat date before the day the series starts: the form and the actions refuse it. */
export const isUntilBeforeStart = (
  schedule: SeriesSchedule,
  start: { readonly at: string; readonly tz: string },
): boolean =>
  schedule.until !== undefined && schedule.until < formatInZone(start.at, start.tz, "yyyy-MM-dd");

const toIso = (date: Date): string => new Date(date).toISOString();

/** Index zero is the template's start; months are always counted from its original day. */
export const seriesSlotAt = (
  anchor: string,
  schedule: SeriesSchedule,
  options: { readonly index: number; readonly zone: string },
): string => {
  const { index, zone } = options;
  switch (schedule.kind) {
    case "daily": {
      return addDaysIn(anchor, index, zone);
    }
    case "weekdays": {
      return toIso(addBusinessDays(anchor, index, { in: tz(zone) }));
    }
    case "every_n_days": {
      return addDaysIn(anchor, index * schedule.days, zone);
    }
    case "weekly": {
      return addDaysIn(anchor, index * 7, zone);
    }
    case "monthly": {
      const year = Number(formatInZone(anchor, zone, "yyyy"));
      const month = Number(formatInZone(anchor, zone, "M"));
      const day = Number(formatInZone(anchor, zone, "d"));
      const target = new Date(Date.UTC(year, month - 1 + index, 1));
      const targetYear = target.getUTCFullYear();
      const targetMonth = target.getUTCMonth() + 1;
      const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
      const date = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
      return wallClockInstant(date, formatInZone(anchor, zone, "HH:mm"), zone);
    }
  }
};

const guessIndex = (
  anchor: string,
  schedule: SeriesSchedule,
  options: { readonly after: string; readonly zone: string },
): number => {
  const { after, zone } = options;
  const context = { in: tz(zone) };
  switch (schedule.kind) {
    case "daily": {
      return Math.max(0, differenceInCalendarDays(after, anchor, context));
    }
    case "weekdays": {
      return Math.max(0, differenceInBusinessDays(after, anchor, context) - 2);
    }
    case "every_n_days": {
      return Math.max(
        0,
        Math.floor(differenceInCalendarDays(after, anchor, context) / schedule.days),
      );
    }
    case "weekly": {
      return Math.max(0, Math.floor(differenceInCalendarDays(after, anchor, context) / 7));
    }
    case "monthly": {
      return Math.max(0, differenceInCalendarMonths(after, anchor, context) - 1);
    }
  }
};

const nextFrom = (
  anchor: string,
  schedule: SeriesSchedule,
  options: { readonly after: string; readonly zone: string; readonly index: number },
): null | SeriesSlot => {
  const { after, zone, index } = options;
  const at = seriesSlotAt(anchor, schedule, { index, zone });
  const localDate = formatInZone(at, zone, "yyyy-MM-dd");
  if (schedule.until !== undefined && localDate > schedule.until) {
    return null;
  }
  return at > after ? { index, at } : nextFrom(anchor, schedule, { ...options, index: index + 1 });
};

/** First occurrence strictly after `after`, with an inclusive final local date. */
export const nextSeriesSlot = (
  anchor: string,
  schedule: SeriesSchedule,
  options: { readonly after: string; readonly zone: string },
): null | SeriesSlot =>
  nextFrom(anchor, schedule, { ...options, index: guessIndex(anchor, schedule, options) });

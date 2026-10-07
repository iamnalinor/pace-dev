import { tz } from "@date-fns/tz";
import { addDays, set } from "date-fns";

import type { Settings } from "../model/settings.ts";

import { formatInZone, startOfDayIn } from "../time.ts";

/** The part of the account settings the schedule reads. */
export type NotifySchedule = Pick<Settings, "digestWindows" | "quietHours">;

const at = (dayStart: string, hhmm: string, zone: string): string => {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  return new Date(
    set(dayStart, { hours, milliseconds: 0, minutes, seconds: 0 }, { in: tz(zone) }),
  ).toISOString();
};

/** The digest windows of yesterday, today and tomorrow in `zone`, earliest first. */
const windowsAround = (now: string, zone: string, schedule: NotifySchedule): readonly string[] => {
  const today = startOfDayIn(now, zone);
  const days = [-1, 0, 1].map((offset) =>
    new Date(addDays(today, offset, { in: tz(zone) })).toISOString(),
  );
  return days
    .flatMap((day) => schedule.digestWindows.map((window) => at(day, window, zone)))
    .toSorted();
};

/** The next digest window strictly after `now`; `null` when the account has none. */
export const nextDigestAt = (now: string, zone: string, schedule: NotifySchedule): null | string =>
  windowsAround(now, zone, schedule).find((window) => window > now) ?? null;

/** The latest digest window at or before `now` (yesterday's at the latest). */
export const lastDigestWindow = (
  now: string,
  zone: string,
  schedule: NotifySchedule,
): null | string => windowsAround(now, zone, schedule).findLast((window) => window <= now) ?? null;

/** Whether `atIso` falls in the quiet hours of `zone` (a range may wrap past midnight). */
export const isQuietAt = (atIso: string, zone: string, schedule: NotifySchedule): boolean => {
  const clock = formatInZone(atIso, zone, "HH:mm");
  const { from, to } = schedule.quietHours;
  if (from === to) {
    return false;
  }
  return from < to ? clock >= from && clock < to : clock >= from || clock < to;
};

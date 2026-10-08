import { tz, tzOffset } from "@date-fns/tz";
import {
  addDays,
  addMinutes,
  differenceInMinutes,
  endOfDay,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfDay,
  startOfISOWeek,
} from "date-fns";

/**
An instant plus the IANA zone it was entered in. Instants are ISO 8601 strings in UTC
(`...Z`); the zone is kept so the UI can say "18:00 Moscow time" when the device has moved.
*/
export type ZonedInstant = {
  readonly at: string;
  readonly tz: string;
};

const toIso = (date: Date): string => new Date(date).toISOString();

/** Last millisecond of the calendar day containing `atIso` in `zone`, as a UTC instant. */
export const endOfDayIn = (atIso: string, zone: string): string =>
  toIso(endOfDay(atIso, { in: tz(zone) }));

/** First millisecond of the calendar day containing `atIso` in `zone`, as a UTC instant. */
export const startOfDayIn = (atIso: string, zone: string): string =>
  toIso(startOfDay(atIso, { in: tz(zone) }));

/** The same wall-clock time `days` calendar days later in `zone` (DST-safe), as a UTC instant. */
export const addDaysIn = (atIso: string, days: number, zone: string): string =>
  toIso(addDays(atIso, days, { in: tz(zone) }));

/** Monday 00:00 of the week containing `atIso` in `zone`, as a UTC instant. */
export const startOfWeekIn = (atIso: string, zone: string): string =>
  toIso(startOfISOWeek(atIso, { in: tz(zone) }));

/** ISO week key like `2026-W41`, computed on the zone's local date. */
export const isoWeekKey = (atIso: string, zone: string): string => {
  const options = { in: tz(zone) };
  const year = getISOWeekYear(atIso, options);
  const week = getISOWeek(atIso, options);
  return `${year}-W${String(week).padStart(2, "0")}`;
};

export const addMinutesIso = (atIso: string, minutes: number): string =>
  toIso(addMinutes(atIso, minutes));

/** Signed minutes from `aIso` to `bIso` (positive when `b` is later). */
export const minutesBetween = (aIso: string, bIso: string): number =>
  differenceInMinutes(bIso, aIso);

/** date-fns `format` on the wall clock of `zone`. */
export const formatInZone = (atIso: string, zone: string, pattern: string): string =>
  format(atIso, pattern, { in: tz(zone) });

/** True when the two zones have different UTC offsets at their instants. */
// eslint-disable-next-line unicorn/consistent-boolean-name -- name fixed by the plan; reads as a predicate
export const zonesDiffer = (a: ZonedInstant, b: ZonedInstant): boolean =>
  tzOffset(a.tz, new Date(a.at)) !== tzOffset(b.tz, new Date(b.at));

export const isValidTimeZone = (zone: string): boolean => {
  if (zone === "") {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

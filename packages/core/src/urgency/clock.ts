import type { UrgencyInput } from "./input.ts";

import { addMinutesIso } from "../time.ts";

const MS_PER_HOUR = 3_600_000;
const MINUTES_PER_DAY = 24 * 60;

/** Signed hours from `fromIso` to `toIso`, millisecond-precise (string order is not assumed). */
export const hoursBetween = (fromIso: string, toIso: string): number =>
  (Date.parse(toIso) - Date.parse(fromIso)) / MS_PER_HOUR;

export const daysBetween = (fromIso: string, toIso: string): number =>
  hoursBetween(fromIso, toIso) / 24;

export const addDays = (iso: string, days: number): string =>
  addMinutesIso(iso, days * MINUTES_PER_DAY);

export const isAfter = (iso: string, thanIso: string): boolean =>
  Date.parse(iso) > Date.parse(thanIso);

/** The earlier of two optional instants; `null` when both are missing. */
export const earliest = (a: null | string, b: null | string): null | string => {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return isAfter(a, b) ? b : a;
};

/**
Waiting freezes the clock at `waitingSince`: the task keeps the urgency it had when it
started waiting, and a retro edit of that instant moves the freeze with it.
*/
export const evaluationClock = (input: UrgencyInput, now: string): string =>
  input.waitingSince ?? now;

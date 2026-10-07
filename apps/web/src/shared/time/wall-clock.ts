import { isValidTimeZone } from "@pace/core";

const MINUTE_MS = 60_000;
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (value: number): string => String(value).padStart(2, "0");

/** Offset of `tz` at `instantMs`, in minutes east of UTC. */
const offsetMinutes = (tz: string, instantMs: number): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: tz,
    year: "numeric",
  }).formatToParts(new Date(instantMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"));
  return Math.round((asUtc - instantMs) / MINUTE_MS);
};

/** The `datetime-local` value showing `atIso` on the wall clock of `tz`. */
export const isoToWallClock = (atIso: string, tz: string): string => {
  const instant = Date.parse(atIso);
  const local = new Date(instant + offsetMinutes(tz, instant) * MINUTE_MS);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
};

/**
The UTC instant of a `datetime-local` value read in `tz`; `null` for anything else. The
offset is read twice because the first guess may sit on the other side of a DST change.
*/
export const wallClockToIso = (local: string, tz: string): null | string => {
  const match = WALL_CLOCK.exec(local);
  if (match === null || !isValidTimeZone(tz)) {
    return null;
  }
  const [, year, month, day, hour, minute] = match.map(Number);
  const asUtc = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  const guess = asUtc - offsetMinutes(tz, asUtc) * MINUTE_MS;
  const instant = asUtc - offsetMinutes(tz, guess) * MINUTE_MS;
  return new Date(instant).toISOString();
};

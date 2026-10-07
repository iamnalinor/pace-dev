import {
  formatInZone,
  formatRelativeDay,
  isValidTimeZone,
  type Language,
  t,
  zonesDiffer,
} from "@pace/core";

/** Who is looking: the account language, the current instant and the device's zone. */
export type Viewer = {
  readonly language: Language;
  readonly now: string;
  readonly deviceTz: string;
};

/** `23:59` on the wall clock of `tz`. */
export const clockTime = (atIso: string, tz: string): string => formatInZone(atIso, tz, "HH:mm");

export type WallClock = { readonly date: string; readonly time: string };

/** The calendar date and the time a person in `tz` reads at that instant. */
export const wallClock = (atIso: string, tz: string): WallClock => ({
  date: formatInZone(atIso, tz, "yyyy-MM-dd"),
  time: clockTime(atIso, tz),
});

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{1,2}):(\d{2})$/;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;

/** The wall clock of `tz` at `ms`, read back as if it were UTC (milliseconds). */
const wallAsUtc = (ms: number, tz: string): number =>
  Date.parse(`${formatInZone(new Date(ms).toISOString(), tz, "yyyy-MM-dd'T'HH:mm")}:00.000Z`);

/** The typed date and time as UTC milliseconds of the same wall clock; `null` when not a real one. */
const typedAsUtc = (date: string, time: string): null | number => {
  const day = DATE.exec(date);
  const clock = TIME.exec(time);
  if (day === null || clock === null) {
    return null;
  }
  const [year, month, dayOfMonth] = day.slice(1).map(Number);
  const [hours, minutes] = clock.slice(1).map(Number);
  if (
    (hours ?? HOURS_PER_DAY) >= HOURS_PER_DAY ||
    (minutes ?? MINUTES_PER_HOUR) >= MINUTES_PER_HOUR
  ) {
    return null;
  }
  const ms = Date.UTC(year ?? 0, (month ?? 1) - 1, dayOfMonth ?? 1, hours, minutes);
  // Date.UTC rolls 2026-02-30 over into March: a real date survives the round trip.
  return new Date(ms).toISOString().startsWith(date) ? ms : null;
};

/**
The instant whose wall clock in `tz` shows the typed date and time; `null` for a malformed
input or an unknown zone. The zone's offset is applied twice because the first guess may sit
on the other side of a summer-time change.
*/
export const fromWallClock = ({
  date,
  time,
  tz,
}: WallClock & { readonly tz: string }): null | string => {
  const wanted = typedAsUtc(date, time);
  if (wanted === null || !isValidTimeZone(tz)) {
    return null;
  }
  const first = wanted + (wanted - wallAsUtc(wanted, tz));
  const second = first + (wanted - wallAsUtc(first, tz));
  return new Date(second).toISOString();
};

/** The zone's short name at that instant (`UTC`, `GMT+3`, `EDT`): the last word of a dated stamp. */
const zoneName = (atIso: string, tz: string): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .format(new Date(atIso))
    .split(" ")
    .at(-1) ?? tz;

const dayAndTime = (atIso: string, tz: string, language: Language): string =>
  new Intl.DateTimeFormat(language, {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone: tz,
  }).format(new Date(atIso));

export type ZonedInput = {
  readonly at: string;
  /** The zone the time was set in. */
  readonly tz: string;
  /** `due` names the day relative to today; `datetime` prints the date. */
  readonly mode: "datetime" | "due";
};

/**
A time in the zone it was set in; when the viewer's zone has another offset, the zone's
name and the viewer's own time follow: `tomorrow 23:59 GMT+3 (your time 20:59)`.
*/
export const zonedText = ({ at, mode, tz }: ZonedInput, viewer: Viewer): string => {
  const { deviceTz, language, now } = viewer;
  const own =
    mode === "due"
      ? `${formatRelativeDay(at, now, { language, tz })} ${clockTime(at, tz)}`
      : dayAndTime(at, tz, language);
  return zonesDiffer({ at, tz }, { at, tz: deviceTz })
    ? t(language, "time.zoned", {
        local: clockTime(at, deviceTz),
        time: own,
        zone: zoneName(at, tz),
      })
    : own;
};

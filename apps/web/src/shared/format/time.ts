import { formatRelativeDay, type Language, t, zonesDiffer } from "@pace/core";

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
};

/** `23:59` on the wall clock of `tz`. */
export const formatTime = (atIso: string, tz: string, language: Language): string =>
  new Intl.DateTimeFormat(language, { ...TIME_OPTIONS, timeZone: tz }).format(new Date(atIso));

/** The zone's short name at that instant (`MSK`, `GMT+3`, `EDT`); the IANA id when none. */
export const zoneLabel = (atIso: string, tz: string, language: Language): string =>
  new Intl.DateTimeFormat(language, { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date(atIso))
    .find((part) => part.type === "timeZoneName")?.value ?? tz;

/** `tomorrow 23:59`, `Fri Oct 9 18:00`: the day as the zone's calendar sees it. */
export const formatDayTime = (
  { at, tz }: { readonly at: string; readonly tz: string },
  { language, now }: Pick<Viewer, "language" | "now">,
): string => `${formatRelativeDay(at, now, { language, tz })} ${formatTime(at, tz, language)}`;

/** `Oct 7, 23:59` in the zone. */
export const formatDateTime = (atIso: string, tz: string, language: Language): string =>
  new Intl.DateTimeFormat(language, {
    ...TIME_OPTIONS,
    day: "numeric",
    month: "short",
    timeZone: tz,
  }).format(new Date(atIso));

export type ZonedFormat = {
  readonly at: string;
  /** The zone the time was set in. */
  readonly tz: string;
  /** The zone of the person looking. */
  readonly deviceTz: string;
  readonly now: string;
  readonly language: Language;
  /** `due` reads the day relative to today; `datetime` is the plain date. */
  readonly mode: "datetime" | "due";
};

/**
The time in its own zone and, when the viewer's zone has another offset, the zone's name
and the viewer's time: `23:59 MSK (your time 22:59)`.
*/
export const formatZoned = ({ at, deviceTz, language, mode, now, tz }: ZonedFormat): string => {
  const own =
    mode === "due"
      ? formatDayTime({ at, tz }, { language, now })
      : formatDateTime(at, tz, language);
  if (!zonesDiffer({ at, tz }, { at, tz: deviceTz })) {
    return own;
  }
  const yours = t(language, "zone.yourTime", { time: formatTime(at, deviceTz, language) });
  return `${own} ${zoneLabel(at, tz, language)} (${yours})`;
};

export type Viewer = Pick<ZonedFormat, "deviceTz" | "language" | "now">;

/** The meta-line due: `Due tomorrow 23:59`. */
export const formatDue = (
  due: { readonly at: string; readonly tz: string },
  viewer: Viewer,
): string =>
  t(viewer.language, "meta.due", {
    when: formatZoned({ ...viewer, at: due.at, mode: "due", tz: due.tz }),
  });

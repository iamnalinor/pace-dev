/**
Converts between `<input type="datetime-local">` values (`YYYY-MM-DDTHH:MM`, no zone) and
UTC instants, reading the wall clock in a named IANA zone. Every due the user picks
goes through here, so an instant never leaves the form without the zone it was set in.
*/

const LOCAL_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const CLOCK_PARTS = ["year", "month", "day", "hour", "minute", "second"] as const;

type ClockPart = (typeof CLOCK_PARTS)[number];

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (zone: string): Intl.DateTimeFormat => {
  const cached = formatterCache.get(zone);
  if (cached !== undefined) {
    return cached;
  }
  const created = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: zone,
    year: "numeric",
  });
  formatterCache.set(zone, created);
  return created;
};

/** The zone's wall clock at `instantMs`, as the numbers of each part. */
const wallClockAt = (instantMs: number, zone: string): Readonly<Record<ClockPart, number>> => {
  const parts = formatterFor(zone).formatToParts(new Date(instantMs));
  const valueOf = (type: ClockPart): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return Object.fromEntries(CLOCK_PARTS.map((part) => [part, valueOf(part)])) as Record<
    ClockPart,
    number
  >;
};

/** The wall clock reinterpreted as UTC, minus the instant: the zone's offset at that instant. */
const offsetAt = (instantMs: number, zone: string): number => {
  const clock = wallClockAt(instantMs, zone);
  return (
    Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second) -
    instantMs
  );
};

const pad = (value: number): string => String(value).padStart(2, "0");

/**
`2026-10-14T23:59` read on `zone`'s clock → `2026-10-14T20:59:00.000Z` for Moscow. A
time inside a spring-forward gap resolves to the nearest real instant after it; `null`
when the text is not a complete, real date-time.
*/
export const wallClockToInstant = (local: string, zone: string): null | string => {
  const match = LOCAL_VALUE.exec(local);
  if (match === null) {
    return null;
  }
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const probe = new Date(asUtc);
  const isReal =
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day &&
    probe.getUTCHours() === hour &&
    probe.getUTCMinutes() === minute;
  if (!isReal) {
    return null;
  }
  // Two passes: the offset at the guessed instant corrects a guess made across a DST edge.
  const guess = asUtc - offsetAt(asUtc, zone);
  return new Date(asUtc - offsetAt(guess, zone)).toISOString();
};

/** The instant as the `datetime-local` value of its wall clock in `zone`. */
export const instantToWallClock = (iso: string, zone: string): string => {
  const clock = wallClockAt(Date.parse(iso), zone);
  return `${String(clock.year)}-${pad(clock.month)}-${pad(clock.day)}T${pad(clock.hour)}:${pad(clock.minute)}`;
};

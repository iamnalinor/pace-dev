import { formatInZone, minutesBetween, wallClockInstant } from "../time.ts";

/**
What the phone reports about itself, already translated from Android's usage events: the
screen going on and off, and an app coming to the foreground or leaving it. These stay on
the phone; only what the person confirms (a sleep block) becomes an event.
*/
export type PhoneEvent = {
  readonly at: string;
  /**
  `unlock`: the lock screen went away (or Pace came to the front): someone is using the phone.
  `lock`: the lock screen came back; an app shown over it (an alarm, a call) is not use.
  */
  readonly kind: "app-start" | "app-stop" | "lock" | "screen-off" | "screen-on" | "unlock";
  /** The app's package name for app events. */
  readonly app?: string;
};

export type Interval = { readonly startAt: string; readonly endAt: string };

/** At least this long asleep, at night, counts as sleep. */
export const SLEEP_MIN_MINUTES = 180;
/** Uses of the phone with less than this between them are one spell awake, never sleep. */
export const REST_MIN_MINUTES = 45;
/** A spell awake this short in the small hours is a wake-up inside the night... */
export const WAKE_UP_MAX_MINUTES = 30;
/** ...when the phone is left alone at least this long after it (back to sleep). */
export const BACK_TO_SLEEP_MINUTES = 90;
/** Wake-ups start after midnight and before this local hour; later ones are the morning. */
const WAKE_UP_UNTIL_HOUR = 7;
/** Noon: a rest that starts after it and before bedtime starts at bedtime instead. */
const NIGHT_UNTIL_HOUR = 12;
/** Local hours a sleep starts in: 21:00 to 05:00 (a morning with the phone in a bag is not sleep). */
const BEDTIME_FROM_HOUR = 21;
const BEDTIME_UNTIL_HOUR = 5;

const byTime = (events: readonly PhoneEvent[]): readonly PhoneEvent[] =>
  events.toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));

/** When the screen was on: each screen-on until the next screen-off (or `now`). */
export const screenOnIntervals = (
  events: readonly PhoneEvent[],
  now: string,
): readonly Interval[] => {
  const sorted = byTime(events);
  const screen = sorted.filter(
    (event) => event.kind === "screen-on" || event.kind === "screen-off",
  );
  return screen
    .map((event, index) => ({ event, next: screen[index + 1] }))
    .filter(({ event, next }) => event.kind === "screen-on" && next?.kind !== "screen-on")
    .map(({ event, next }) => ({ endAt: next?.at ?? now, startAt: event.at }));
};

const hourIn = (atIso: string, zone: string): number => Number(formatInZone(atIso, zone, "H"));

const isBedtime = (atIso: string, zone: string): boolean => {
  const hour = hourIn(atIso, zone);
  return hour >= BEDTIME_FROM_HOUR || hour < BEDTIME_UNTIL_HOUR;
};

export type SleepCandidate = Interval & {
  /** Asleep: the span without the wake-ups. */
  readonly minutes: number;
  /** Spells awake with the phone during the night. */
  readonly wakeUps: number;
};

/** Lock-screen state at `atIso`: the last lock or unlock before it says (unlocked when unknown). */
const isLockedAt = (sorted: readonly PhoneEvent[], atIso: string): boolean =>
  sorted.findLast(
    (event) => event.at <= atIso && (event.kind === "lock" || event.kind === "unlock"),
  )?.kind === "lock";

/**
Where a spell in front ends: at the screen going off. When the next thing written is the screen
coming on (or the lock screen) instead, the screen-off was lost (the phone died): the spell is
only known to have started, so it ends where it began rather than spanning the gap.
*/
const spellEnd = ({
  index,
  isEnd,
  now,
  sorted,
}: {
  readonly sorted: readonly PhoneEvent[];
  readonly index: number;
  readonly isEnd: (later: PhoneEvent) => boolean;
  readonly now: string;
}): string => {
  const start = sorted[index]?.at ?? now;
  const end = sorted.slice(index + 1).find((later) => isEnd(later) || later.kind === "screen-on");
  if (end === undefined) {
    return now;
  }
  return end.kind === "screen-on" ? start : end.at;
};

/**
When someone was using the phone: unlocked until the screen went off, or an app in front
while the lock screen was away. A screen lit by a notification, an alarm or a call shown over
the lock screen, or a look at the time, is not use.
*/
const useIntervals = (events: readonly PhoneEvent[], now: string): readonly Interval[] => {
  const sorted = byTime(events);
  const unlocked = sorted
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.kind === "unlock")
    .map(({ event, index }) => ({
      endAt: spellEnd({
        index,
        isEnd: (later) => later.kind === "screen-off" || later.kind === "lock",
        now,
        sorted,
      }),
      startAt: event.at,
    }));
  const inFront = foregroundIntervals(events, now).filter(
    (interval) => !isLockedAt(sorted, interval.startAt),
  );
  return [...unlocked, ...inFront].toSorted((a, b) => a.startAt.localeCompare(b.startAt));
};

/** The later of two instants (ISO strings compare in time order; `Math.max` would read them as NaN). */
const laterOf = (a: string, b: string): string => (a.localeCompare(b) > 0 ? a : b);

/** Uses with less than `REST_MIN_MINUTES` between them, joined into spells awake. */
const awakeSpells = (uses: readonly Interval[]): readonly Interval[] =>
  // eslint-disable-next-line unicorn/no-array-reduce -- each use either extends the spell before it or starts a new one
  uses.reduce<readonly Interval[]>((spells, use) => {
    const last = spells.at(-1);
    return last !== undefined && minutesBetween(last.endAt, use.startAt) < REST_MIN_MINUTES
      ? [...spells.slice(0, -1), { endAt: laterOf(use.endAt, last.endAt), startAt: last.startAt }]
      : [...spells, use];
  }, []);

/** A night does not start before 21:00: a phone put away at 19:52 says nothing about 20:30. */
const bedtimeFloor = (atIso: string, zone: string): string => {
  const hour = hourIn(atIso, zone);
  return hour >= NIGHT_UNTIL_HOUR && hour < BEDTIME_FROM_HOUR
    ? wallClockInstant(formatInZone(atIso, zone, "yyyy-MM-dd"), `${BEDTIME_FROM_HOUR}:00`, zone)
    : atIso;
};

/** A short spell awake in the small hours, followed by a long rest: woke up, went back to sleep. */
const isWakeUp = (spell: Interval, restAfter: Interval, zone: string): boolean =>
  minutesBetween(spell.startAt, spell.endAt) <= WAKE_UP_MAX_MINUTES &&
  hourIn(spell.startAt, zone) < WAKE_UP_UNTIL_HOUR &&
  minutesBetween(restAfter.startAt, restAfter.endAt) >= BACK_TO_SLEEP_MINUTES;

type Night = Interval & { readonly awake: number; readonly wakeUps: number };

/**
The night's sleep as the phone's use tells it: the rests between spells awake (at least
`REST_MIN_MINUTES` without using the phone), joined across short wake-ups in the small hours;
the longest one of three hours or more that touches the night. `null` without one, and while
the phone has not been used since (a rest still running is not judged).
*/
export const detectSleep = (
  events: readonly PhoneEvent[],
  { now, zone }: { readonly now: string; readonly zone: string },
): null | SleepCandidate => {
  const spells = awakeSpells(useIntervals(events, now));
  // eslint-disable-next-line unicorn/no-array-reduce -- each rest either extends the night before it across a wake-up or starts a new one
  const nights = spells.slice(1).reduce<readonly Night[]>((joined, next, index) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index < spells.length - 1
    const before = spells[index]!;
    const rest = { endAt: next.startAt, startAt: before.endAt };
    const last = joined.at(-1);
    return last?.endAt === before.startAt && isWakeUp(before, rest, zone)
      ? [
          ...joined.slice(0, -1),
          {
            awake: last.awake + minutesBetween(before.startAt, before.endAt),
            endAt: rest.endAt,
            startAt: last.startAt,
            wakeUps: last.wakeUps + 1,
          },
        ]
      : [...joined, { ...rest, awake: 0, startAt: bedtimeFloor(rest.startAt, zone), wakeUps: 0 }];
  }, []);
  return (
    nights
      .filter((night) => night.startAt < night.endAt)
      .map(({ awake, endAt, startAt, wakeUps }) => ({
        endAt,
        minutes: minutesBetween(startAt, endAt) - awake,
        startAt,
        wakeUps,
      }))
      .filter((night) => night.minutes >= SLEEP_MIN_MINUTES && isBedtime(night.startAt, zone))
      .toSorted((a, b) => b.minutes - a.minutes)
      .at(0) ?? null
  );
};

export type AppMinutes = { readonly app: string; readonly minutes: number };

type AppStart = PhoneEvent & { readonly app: string; readonly kind: "app-start" };

const isAppStart = (event: PhoneEvent): event is AppStart =>
  event.kind === "app-start" && event.app !== undefined;

/** What ends an app's foreground spell: another app, the screen going off, or its own stop. */
const isEndOf = (app: string, later: PhoneEvent): boolean =>
  later.kind === "app-stop"
    ? later.app === app
    : later.kind === "app-start" || later.kind === "screen-off";

/** Each app's time in the foreground: from its start to the next start, its stop or screen-off. */
const foregroundIntervals = (
  events: readonly PhoneEvent[],
  now: string,
): readonly (Interval & { readonly app: string })[] => {
  const sorted = byTime(events);
  return sorted
    .map((event, index) => ({ event, index }))
    .filter((entry): entry is { event: AppStart; index: number } => isAppStart(entry.event))
    .map(({ event, index }) => ({
      app: event.app,
      endAt: spellEnd({ index, isEnd: (later) => isEndOf(event.app, later), now, sorted }),
      startAt: event.at,
    }));
};

/** Each app's spells in front (a minute or longer), by start; one still open ends at `now`. */
export const appSessions = (
  events: readonly PhoneEvent[],
  now: string,
): readonly (Interval & { readonly app: string })[] =>
  foregroundIntervals(events, now)
    .filter((interval) => Date.parse(interval.endAt) - Date.parse(interval.startAt) >= 60_000)
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt));

const clipMinutes = (interval: Interval, from: string, to: string): number => {
  const start = Math.max(Date.parse(interval.startAt), Date.parse(from));
  const end = Math.min(Date.parse(interval.endAt), Date.parse(to));
  return Math.max(0, (end - start) / 60_000);
};

/** Foreground minutes per app inside [from, to], largest first; apps under a minute left out. */
export const appUsage = (
  events: readonly PhoneEvent[],
  { from, now, to }: { readonly from: string; readonly to: string; readonly now: string },
): readonly AppMinutes[] => {
  const intervals = foregroundIntervals(events, now);
  const apps = [...new Set(intervals.map((interval) => interval.app))];
  return apps
    .map((name) => ({
      app: name,
      minutes: Math.round(
        intervals
          .filter((interval) => interval.app === name)
          .map((interval) => clipMinutes(interval, from, to))

          .reduce((sum, minutes) => sum + minutes, 0),
      ),
    }))
    .filter((row) => row.minutes >= 1)
    .toSorted((a, b) => b.minutes - a.minutes);
};

/** Breaks in use this short (a pocket, a timeout) do not end a phone session. */
const SESSION_GAP_MINUTES = 2;

/** Uses that overlap or touch, joined; by start. */
const joinedUses = (events: readonly PhoneEvent[], now: string): readonly Interval[] =>
  // eslint-disable-next-line unicorn/no-array-reduce -- each use either extends the one before it or starts a new one
  useIntervals(events, now).reduce<readonly Interval[]>((joined, use) => {
    const last = joined.at(-1);
    return last !== undefined && use.startAt <= last.endAt
      ? [...joined.slice(0, -1), { endAt: laterOf(use.endAt, last.endAt), startAt: last.startAt }]
      : [...joined, use];
  }, []);

/**
When the phone was picked up for the session still going on at `now`: uses joined across
short breaks. `null` while nobody uses it. An activity that ran past its Expect probably
ended about then.
*/
export const phonePickupAt = (events: readonly PhoneEvent[], now: string): null | string => {
  const spells = joinedUses(events, now);
  const last = spells.at(-1);
  if (last?.endAt !== now) {
    return null;
  }
  const earlier = spells.slice(0, -1).toReversed();
  const joined = earlier.findIndex(
    (spell, index) =>
      minutesBetween(spell.endAt, (earlier[index - 1] ?? last).startAt) >= SESSION_GAP_MINUTES,
  );
  const session = joined === -1 ? earlier : earlier.slice(0, joined);
  return session.at(-1)?.startAt ?? last.startAt;
};

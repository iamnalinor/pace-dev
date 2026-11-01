import { minutesBetween } from "../time.ts";
import {
  awakeSpells,
  bedtimeFloor,
  byTime,
  foregroundIntervals,
  type Interval,
  isBedtime,
  isWakeUp,
  laterOf,
  type PhoneEvent,
  phoneUses,
  SLEEP_MIN_MINUTES,
} from "./phone-use.ts";

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

export type SleepCandidate = Interval & {
  /** Asleep: the span without the wake-ups. */
  readonly minutes: number;
  /** Spells awake with the phone during the night. */
  readonly wakeUps: number;
};

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
  const spells = awakeSpells(phoneUses(events, now));
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
  phoneUses(events, now).reduce<readonly Interval[]>((joined, use) => {
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

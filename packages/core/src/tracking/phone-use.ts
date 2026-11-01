import { formatInZone, minutesBetween, wallClockInstant } from "../time.ts";

/**
What the phone reports about itself, already translated from Android's usage events: the
screen going on and off, and an app coming to the foreground or leaving it. On the server only
what the phone derives from them travels: its app sessions and its use intervals.
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

// The sleep heuristic's numbers, tuned on the owner's production `usage_sessions` (Oct 15–29,
// bug class 39). The phone's sleep card and the server's automatic sleep read the same ones.

/** At least this long asleep, at night, counts as sleep. */
export const SLEEP_MIN_MINUTES = 180;
/** Uses of the phone with less than this between them are one spell awake, never sleep. */
export const REST_MIN_MINUTES = 45;
/** A spell awake this short in the small hours is a wake-up inside the night... */
export const WAKE_UP_MAX_MINUTES = 30;
/** ...when the phone is left alone at least this long after it (back to sleep). */
export const BACK_TO_SLEEP_MINUTES = 90;
/** Wake-ups start after midnight and before this local hour; later ones are the morning. */
export const WAKE_UP_UNTIL_HOUR = 7;
/** Noon: a rest that starts after it and before bedtime starts at bedtime instead. */
export const NIGHT_UNTIL_HOUR = 12;
/** Local hours a sleep starts in: 21:00 to 05:00 (a morning with the phone in a bag is not sleep). */
export const BEDTIME_FROM_HOUR = 21;
export const BEDTIME_UNTIL_HOUR = 5;

export const byTime = (events: readonly PhoneEvent[]): readonly PhoneEvent[] =>
  events.toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));

const hourIn = (atIso: string, zone: string): number => Number(formatInZone(atIso, zone, "H"));

/** Whether a sleep may start at this instant: between 21:00 and 05:00 local time. */
export const isBedtime = (atIso: string, zone: string): boolean => {
  const hour = hourIn(atIso, zone);
  return hour >= BEDTIME_FROM_HOUR || hour < BEDTIME_UNTIL_HOUR;
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

type AppStart = PhoneEvent & { readonly app: string; readonly kind: "app-start" };

const isAppStart = (event: PhoneEvent): event is AppStart =>
  event.kind === "app-start" && event.app !== undefined;

/** What ends an app's foreground spell: another app, the screen going off, or its own stop. */
const isEndOf = (app: string, later: PhoneEvent): boolean =>
  later.kind === "app-stop"
    ? later.app === app
    : later.kind === "app-start" || later.kind === "screen-off";

/** Each app's time in the foreground: from its start to the next start, its stop or screen-off. */
export const foregroundIntervals = (
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

/**
When someone was using the phone: unlocked until the screen went off, or an app in front
while the lock screen was away. A screen lit by a notification, an alarm or a call shown over
the lock screen, or a look at the time, is not use. By start.
*/
export const phoneUses = (events: readonly PhoneEvent[], now: string): readonly Interval[] => {
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
  // Only the times: which app was in front stays on the phone.
  const inFront = foregroundIntervals(events, now)
    .filter((interval) => !isLockedAt(sorted, interval.startAt))
    .map(({ endAt, startAt }) => ({ endAt, startAt }));
  return [...unlocked, ...inFront].toSorted((a, b) => a.startAt.localeCompare(b.startAt));
};

/** The later of two instants (ISO strings compare in time order; `Math.max` would read them as NaN). */
export const laterOf = (a: string, b: string): string => (a.localeCompare(b) > 0 ? a : b);

/** Uses (by start) with less than `REST_MIN_MINUTES` between them, joined into spells awake. */
export const awakeSpells = (uses: readonly Interval[]): readonly Interval[] =>
  // eslint-disable-next-line unicorn/no-array-reduce -- each use either extends the spell before it or starts a new one
  uses.reduce<readonly Interval[]>((spells, use) => {
    const last = spells.at(-1);
    return last !== undefined && minutesBetween(last.endAt, use.startAt) < REST_MIN_MINUTES
      ? [...spells.slice(0, -1), { endAt: laterOf(use.endAt, last.endAt), startAt: last.startAt }]
      : [...spells, use];
  }, []);

/** A night does not start before 21:00: a phone put away at 19:52 says nothing about 20:30. */
export const bedtimeFloor = (atIso: string, zone: string): string => {
  const hour = hourIn(atIso, zone);
  return hour >= NIGHT_UNTIL_HOUR && hour < BEDTIME_FROM_HOUR
    ? wallClockInstant(formatInZone(atIso, zone, "yyyy-MM-dd"), `${BEDTIME_FROM_HOUR}:00`, zone)
    : atIso;
};

/** A short spell awake in the small hours, followed by a long rest: woke up, went back to sleep. */
export const isWakeUp = (spell: Interval, restAfter: Interval, zone: string): boolean =>
  minutesBetween(spell.startAt, spell.endAt) <= WAKE_UP_MAX_MINUTES &&
  hourIn(spell.startAt, zone) < WAKE_UP_UNTIL_HOUR &&
  minutesBetween(restAfter.startAt, restAfter.endAt) >= BACK_TO_SLEEP_MINUTES;

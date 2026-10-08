import { formatInZone, minutesBetween } from "../time.ts";

/**
What the phone reports about itself, already translated from Android's usage events: the
screen going on and off, and an app coming to the foreground or leaving it. These stay on
the phone; only what the person confirms (a sleep block) becomes an event.
*/
export type PhoneEvent = {
  readonly at: string;
  readonly kind: "app-start" | "app-stop" | "screen-off" | "screen-on";
  /** The app's package name for app events. */
  readonly app?: string;
};

export type Interval = { readonly startAt: string; readonly endAt: string };

/** At least this long with the screen off, at night, counts as sleep. */
export const SLEEP_MIN_MINUTES = 180;
/** A glance this short (the time, a message) does not end the night: it is a wake-up. */
export const WAKE_BLIP_MINUTES = 5;
/** Local hours a sleep stretch must touch: 21:00 to 12:00 the next day. */
const NIGHT_FROM_HOUR = 21;
const NIGHT_UNTIL_HOUR = 12;

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

/** The screen-off stretches between two screen-on spells (a stretch still running is unknown). */
const offStretches = (on: readonly Interval[]): readonly Interval[] =>
  on.slice(1).map((interval, index) => ({
    endAt: interval.startAt,
    startAt: on[index]?.endAt ?? interval.startAt,
  }));

type Night = Interval & { readonly wakeUps: number };

/** Joins stretches split by a short glance at the screen; each glance counts as a wake-up. */
const mergeGlances = (stretches: readonly Interval[]): readonly Night[] =>
  // eslint-disable-next-line unicorn/no-array-reduce -- each stretch either extends the night before it or starts a new one
  stretches.reduce<readonly Night[]>((nights, stretch) => {
    const last = nights.at(-1);
    return last !== undefined && minutesBetween(last.endAt, stretch.startAt) <= WAKE_BLIP_MINUTES
      ? [
          ...nights.slice(0, -1),
          { endAt: stretch.endAt, startAt: last.startAt, wakeUps: last.wakeUps + 1 },
        ]
      : [...nights, { ...stretch, wakeUps: 0 }];
  }, []);

const hourIn = (atIso: string, zone: string): number => Number(formatInZone(atIso, zone, "H"));

const isNightHour = (hour: number): boolean => hour >= NIGHT_FROM_HOUR || hour < NIGHT_UNTIL_HOUR;

/** Touches the night when it starts or ends in it, or is long enough to span it. */
const isAtNight = (stretch: Interval, zone: string): boolean =>
  isNightHour(hourIn(stretch.startAt, zone)) ||
  isNightHour(hourIn(stretch.endAt, zone)) ||
  minutesBetween(stretch.startAt, stretch.endAt) >= (NIGHT_FROM_HOUR - NIGHT_UNTIL_HOUR) * 60;

export type SleepCandidate = Interval & {
  readonly minutes: number;
  /** Short glances at the screen during the night. */
  readonly wakeUps: number;
};

/**
The night's sleep as the screen tells it: the longest stretch with the screen off of at
least three hours that touches the night, short glances merged. `null` without one.
*/
export const detectSleep = (
  events: readonly PhoneEvent[],
  { now, zone }: { readonly now: string; readonly zone: string },
): null | SleepCandidate =>
  mergeGlances(offStretches(screenOnIntervals(events, now)))
    .map((night) => ({ ...night, minutes: minutesBetween(night.startAt, night.endAt) }))
    .filter((night) => night.minutes >= SLEEP_MIN_MINUTES && isAtNight(night, zone))
    .toSorted((a, b) => b.minutes - a.minutes)
    .at(0) ?? null;

export type AppMinutes = { readonly app: string; readonly minutes: number };

type AppStart = PhoneEvent & { readonly app: string; readonly kind: "app-start" };

const isAppStart = (event: PhoneEvent): event is AppStart =>
  event.kind === "app-start" && event.app !== undefined;

/** What ends an app's foreground spell: another app, the screen going off, or its own stop. */
const isEndOf = (app: string, later: PhoneEvent): boolean =>
  later.kind === "app-stop" ? later.app === app : later.kind !== "screen-on";

/** Each app's time in the foreground: from its start to the next start, its stop or screen-off. */
const foregroundIntervals = (
  events: readonly PhoneEvent[],
  now: string,
): readonly (Interval & { readonly app: string })[] => {
  const sorted = byTime(events);
  return sorted
    .map((event, index) => ({ event, index }))
    .filter((entry): entry is { event: AppStart; index: number } => isAppStart(entry.event))
    .map(({ event, index }) => {
      const end = sorted.slice(index + 1).find((later) => isEndOf(event.app, later));
      return { app: event.app, endAt: end?.at ?? now, startAt: event.at };
    });
};

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

/** Screen-offs this short (a pocket, a timeout) do not end a phone session. */
const SESSION_GAP_MINUTES = 2;

/**
When the phone was picked up for the session still going on at `now`: screen-on spells
joined across short screen-offs. `null` while the screen is off. An activity that ran past
its Expect probably ended about then.
*/
export const phonePickupAt = (events: readonly PhoneEvent[], now: string): null | string => {
  const spells = screenOnIntervals(events, now);
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

/** Apps whose time is talk, not work, unless the activity was about talking. */
export const MESSENGER_PACKAGES: ReadonlySet<string> = new Set([
  "com.discord",
  "com.facebook.orca",
  "com.slack",
  "com.viber.voip",
  "com.vkontakte.android",
  "com.whatsapp",
  "org.telegram.messenger",
  "org.thoughtcrime.securesms",
]);

/** The share of messenger time taken off a block. */
export const MESSENGER_PENALTY = 0.25;

export type Counted = { readonly counted: number; readonly messengerMinutes: number };

/** A block's minutes less a quarter of the messenger time inside it (none when on purpose). */
export const countedMinutes = (
  minutes: number,
  usage: readonly AppMinutes[],
  { messengers = MESSENGER_PACKAGES, onPurpose = false } = {},
): Counted => {
  const messengerMinutes = usage
    .filter((row) => messengers.has(row.app))
    .reduce((sum, row) => sum + row.minutes, 0);
  return {
    counted: onPurpose
      ? minutes
      : Math.max(0, Math.round(minutes - MESSENGER_PENALTY * messengerMinutes)),
    messengerMinutes,
  };
};

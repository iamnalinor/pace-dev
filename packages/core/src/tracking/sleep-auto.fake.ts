import { SyncEventSchema } from "../api/schemas/sync.ts";
import { type Event, type EventInput, EventSchema } from "../events/event-schema.ts";
import { materialize } from "../materialize/materializer.ts";
import { event } from "../materialize/task-fixture.fake.ts";
import { addMinutesIso, wallClockInstant } from "../time.ts";
import { INITIAL_TIME_STATE } from "./model.ts";
import { type PhoneEvent, phoneUses } from "./phone-use.ts";
import {
  decideSleep,
  type DeviceUse,
  type SleepDecision,
  sleepEvents,
  type SleepInput,
} from "./sleep-auto.ts";
import { sleepInputOf } from "./sleep-input.ts";
import { timeReducer } from "./time-reducer.ts";

export const MOSCOW = "Europe/Moscow";
export const NEW_YORK = "America/New_York";

/** The calendar day after `date` (`yyyy-MM-dd`), whatever the zone. */
const nextDay = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);

/**
A wall-clock time in the night that starts on `night` (the noon-to-noon span): `23:40` is on
that evening, `07:10` the next morning. Moscow's night of Wednesday October 7 2026 by default.
*/
export const at = (hhmm: string, { night = "2026-10-07", zone = MOSCOW } = {}): string => {
  const hour = Number(hhmm.slice(0, 2));
  return wallClockInstant(hour >= 12 ? night : nextDay(night), hhmm, zone);
};

/** Someone used a device from `from` to `to` (Moscow wall clock in the default night). */
export const use = (from: string, to: string, deviceId = "phone"): DeviceUse => ({
  deviceId,
  endAt: at(to),
  startAt: at(from),
});

/** What the phone uploads from its own events: its use intervals, nothing about the apps. */
export const usesFromPhone = (events: readonly PhoneEvent[], now: string): readonly DeviceUse[] =>
  phoneUses(events, now).map((interval) => ({ deviceId: "phone", ...interval }));

const lit = (iso: string): readonly PhoneEvent[] => [
  { at: iso, kind: "screen-on" },
  { at: addMinutesIso(iso, 1), kind: "screen-off" },
];

const used = (from: string, to: string): readonly PhoneEvent[] => [
  { at: at(from), kind: "screen-on" },
  { at: at(from), kind: "unlock" },
  { at: at(to), kind: "screen-off" },
  { at: at(to), kind: "lock" },
];

/**
The brief's night as the phone sees it, with the noise it adds (class 39): the last use at
23:40, a notification lighting the screen every seven minutes until morning, an alarm shown
over the lock screen at 07:00, and the first real use at 07:10.
*/
export const NOISY_NIGHT: readonly PhoneEvent[] = [
  ...used("23:10", "23:40"),
  ...Array.from({ length: 60 }, (_, index) => lit(addMinutesIso(at("23:45"), index * 7))).flat(),
  { at: at("07:00"), kind: "screen-on" },
  { app: "com.google.android.deskclock", at: at("07:00"), kind: "app-start" },
  { app: "com.google.android.deskclock", at: at("07:02"), kind: "app-stop" },
  { at: at("07:02"), kind: "screen-off" },
  ...used("07:10", "07:25"),
];

/** A sparse evening: a few minutes on the phone every 40 minutes from 18:00 to 23:00. */
export const SPARSE_EVENING: readonly DeviceUse[] = Array.from({ length: 8 }, (_, index) => {
  const startAt = addMinutesIso(at("18:00"), index * 40);
  return { deviceId: "phone", endAt: addMinutesIso(startAt, 3), startAt };
});

/** The rules' input builder, as the server's pass uses it (the tests read activities through it). */
export { sleepActivitiesOf } from "./sleep-input.ts";

/**
The log after appending events, as the store does: an id already in the log writes nothing.
Each event goes through the event schema and the sync's envelope, so an id or payload the log
would refuse, or one a client's pull would leave out (an id past `EVENT_ID_MAX`), fails here.
*/
export const appended = (
  log: readonly Event[],
  events: readonly EventInput[],
  now: string,
): readonly Event[] => {
  const ids = new Set(log.map((event) => event.id));
  const fresh = events
    .filter((input) => input.id !== undefined && !ids.has(input.id))
    .map((input) => EventSchema.parse({ ...input, deviceId: "server", recordedAt: now }))
    .map((event) => ({ ...event, ...SyncEventSchema.pick({ id: true }).parse(event) }));
  return [...log, ...fresh];
};

export type Known = {
  readonly uses: readonly DeviceUse[];
  readonly knownUntil: null | string;
  readonly zone?: string;
  /** Where the uses start being known; noon before the default night unless said. */
  readonly usesFrom?: string;
  /** The latest `knownUntil` an earlier pass decided with; none unless said. */
  readonly decidedUntil?: null | string;
  /** When the pass runs; five minutes after `knownUntil` unless said. */
  readonly now?: string;
};

export type Step = {
  readonly input: SleepInput;
  readonly decisions: readonly SleepDecision[];
  readonly events: readonly EventInput[];
  readonly log: readonly Event[];
};

/** One evaluation, as the Durable Object runs it: decide on the log, append the events. */
export const step = (log: readonly Event[], known: Known): Step => {
  const { decidedUntil = null, knownUntil, uses, usesFrom = at("12:00"), zone = MOSCOW } = known;
  const now = known.now ?? (knownUntil === null ? at("12:00") : addMinutesIso(knownUntil, 5));
  const input = sleepInputOf(log, { decidedUntil, knownUntil, now, uses, usesFrom, zone });
  const decisions = decideSleep(input);
  const events = sleepEvents(decisions, input);
  return { decisions, events, input, log: appended(log, events, now) };
};

/** Evaluations at each `knownUntil` in turn over the same uses (late uploads arriving). */
export const steps = (
  log: readonly Event[],
  uses: readonly DeviceUse[],
  knownUntils: readonly string[],
): readonly Step[] =>
  // eslint-disable-next-line unicorn/no-array-reduce -- each evaluation runs on the log the one before left
  knownUntils.reduce<readonly Step[]>(
    (done, knownUntil) => [...done, step(done.at(-1)?.log ?? log, { knownUntil, uses })],
    [],
  );

/** The effective sleeps in the log, by start. */
export const sleepsIn = (
  log: readonly Event[],
): readonly { readonly startAt: string; readonly endAt: null | string }[] =>
  Object.values(materialize(log, timeReducer, INITIAL_TIME_STATE).activities)
    .filter((activity) => activity.category === "sleep")
    .map(({ endAt, startAt }) => ({ endAt, startAt }))
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt));

type Body<I = EventInput> = I extends { readonly type: unknown; readonly payload: unknown }
  ? Pick<I, "payload" | "type">
  : never;

/** A person's own event in the log (from the app, with a ULID numbered `index`). */
export const byPerson = (index: number, occurredAt: string, body: Body): Event =>
  event(index, { occurredAt, precision: "exact", source: "app", ...body });

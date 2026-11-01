import {
  addMinutesIso,
  BEDTIME_FROM_HOUR,
  type DeviceUse,
  formatInZone,
  NIGHT_UNTIL_HOUR,
  sleepHorizon,
  type SleepInput,
  wallClockInstant,
} from "@pace/core";

// How far a sleep pass that read the log holds, so the passes after it load nothing they can decide
// nothing on (bug-lessons class 55): the store loads the whole log for a pass that decides.

/** Storage key of how far the last pass's decisions hold (`Held`): a pass within it loads nothing. */
const HELD_KEY = "sleep:held";

/**
How far the last pass that read the log holds, as digests (the log's `seq` and the zone; the uses;
the uses that start before what it decided on) and core's `sleepHorizon` of its input. The uses
are those that end after its `anchor`, the front of the window it decided on: later passes read
from there while the hold lasts, so the front moving on with `now` changes no digest, while use
that arrives late anywhere in it does.
*/
export type Held = {
  readonly anchor: string;
  readonly log: string;
  readonly uses: string;
  readonly usesBefore: string;
  /** The `knownUntil` it decided on (never below `decidedUntil`). */
  readonly decidedOn: string;
  readonly quietUntil: null | string;
  readonly isSettled: boolean;
};

/**
How much further back than its own window (36 hours) a pass reads while a hold lasts (from the hold's `anchor`): past it
the hold is let go and made again from the window as it is, so no read grows without bound.
*/
const ANCHOR_KEPT_MINUTES = 24 * 60;

/** A SHA-256 digest of a value's JSON. */
const digestOf = async (value: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** What a pass decides on, as `Held` compares it (`uses`: those read from the hold's anchor). */
export type DecidedOn = {
  readonly decidedOn: string;
  readonly seq: number;
  readonly uses: readonly DeviceUse[];
  readonly zone: string;
};

/** The uses a window from `from` holds (the store reads those that end after it). */
export const usesAfter = (uses: readonly DeviceUse[], from: string): readonly DeviceUse[] =>
  uses.filter((use) => use.endAt > from);

const digestsOf = async ({ decidedOn, seq, uses, zone }: DecidedOn) => ({
  log: await digestOf({ seq, zone }),
  uses: await digestOf(uses),
  usesBefore: await digestOf(uses.filter((use) => use.startAt < decidedOn)),
});

/** 21:00 local on the day of `at`: the first instant a sleep can start after a day. */
const eveningOf = (at: string, zone: string): string =>
  wallClockInstant(formatInZone(at, zone, "yyyy-MM-dd"), `${String(BEDTIME_FROM_HOUR)}:00`, zone);

/**
Whether the last pass still holds: the same log and zone, and either the same uses (read from its
anchor) with less known than its horizon, or (all it followed decided for good, by day: noon to
21:00 local) only new use after what it knew, and still before the evening. Nothing it can decide
on changed, so the whole log is not loaded again for it (each phone upload moves `knownUntil`).
The window's front moving on is no change: a use that leaves it only ever bore on a night the
rules no longer reconcile (core's property 13 moves the front).
*/
export const isHeld = async (held: Held | undefined, now: DecidedOn): Promise<boolean> => {
  if (held === undefined) {
    return false;
  }
  const digests = await digestsOf({ ...now, decidedOn: held.decidedOn });
  if (digests.log !== held.log) {
    return false;
  }
  const isQuiet =
    digests.uses === held.uses && (held.quietUntil === null || now.decidedOn < held.quietUntil);
  const hour = Number(formatInZone(held.decidedOn, now.zone, "H"));
  const isSettledDay =
    held.isSettled &&
    hour >= NIGHT_UNTIL_HOUR &&
    hour < BEDTIME_FROM_HOUR &&
    now.decidedOn < eveningOf(held.decidedOn, now.zone) &&
    digests.usesBefore === held.usesBefore;
  return isQuiet || isSettledDay;
};

/**
After a pass that read the log: remembers how far its decisions hold (as the log stands after its
own writes), from the front of the window it decided on, so the next pass within that loads
nothing.
*/
export const hold = async (
  storage: DurableObjectStorage,
  { decidedOn, input, seq }: { decidedOn: Omit<DecidedOn, "seq">; input: SleepInput; seq: number },
): Promise<void> => {
  const digests = await digestsOf({ ...decidedOn, seq });
  const held: Held = {
    ...digests,
    anchor: input.usesFrom,
    decidedOn: decidedOn.decidedOn,
    ...sleepHorizon(input),
  };
  await storage.put(HELD_KEY, held);
};

/**
The hold a pass may still be within: one whose anchor the window's front has not passed by more
than a day (the pass then reads from the anchor). Past that it is let go, and the pass decides and
holds again from its own front.
*/
export const keptHold = (held: Held | undefined, usesFrom: string): Held | undefined =>
  held !== undefined &&
  held.anchor <= usesFrom &&
  held.anchor >= addMinutesIso(usesFrom, -ANCHOR_KEPT_MINUTES)
    ? held
    : undefined;

/** The hold the last pass that read the log left, if any. */
export const heldOf = async (storage: DurableObjectStorage): Promise<Held | undefined> =>
  await storage.get<Held>(HELD_KEY);

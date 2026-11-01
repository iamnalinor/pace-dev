import {
  addMinutesIso,
  awakeSpells,
  BEDTIME_FROM_HOUR,
  decideSleep,
  type DeviceUse,
  type Event,
  type EventInput,
  formatInZone,
  NIGHT_UNTIL_HOUR,
  type SleepDecision,
  sleepEvents,
  sleepHorizon,
  type SleepInput,
  sleepInputOf,
  type SleepLogInputs,
  sleepRuleOf,
  wallClockInstant,
} from "@pace/core";

import type { DecisionEntry } from "../shared/contract.ts";
import type { SleepUsage } from "./cloud-data.ts";

import { createLogger } from "../shared/logger.ts";
import { armEarliest, nextSleepCheckAt } from "./alarm.ts";

/** Storage key of the highest `knownUntil` a pass decided with: less known later undoes nothing. */
export const DECIDED_UNTIL_KEY = "sleep:decided-until";

/**
Storage key of when automatic sleep next looks (epoch ms): `alarm()` runs a pass only once it has
come, and arms it again when another wait's earlier alarm fired first.
*/
export const SLEEP_NEXT_AT_KEY = "sleep:next-at";

/**
Storage key of the `decidedUntil` the last pass without a fresh phone ended the running sleeps at:
the same again (an older app's uploads keep nothing fresh) reads nothing.
*/
const ENDED_AT_KEY = "sleep:ended-at";

/** Storage key of how far the last pass's decisions hold (`Held`): a pass within it loads nothing. */
const HELD_KEY = "sleep:held";

/**
How far the last pass that read the log holds, as digests (the log's `seq` and the zone; the uses;
the uses that start before what it decided on) and core's `sleepHorizon` of its input.
*/
type Held = {
  readonly log: string;
  readonly uses: string;
  readonly usesBefore: string;
  /** The `knownUntil` it decided on (never below `decidedUntil`). */
  readonly decidedOn: string;
  readonly quietUntil: null | string;
  readonly isSettled: boolean;
};

/** How far back a pass reads use: a night and the evening before it, whatever the upload's delay. */
const USES_FOR_MINUTES = 36 * 60;

/** How much use before a decision's instant its log row keeps as what it relied on. */
const SPELLS_BEFORE_MINUTES = 3 * 60;

/** What the pass needs from the user's store. */
export type SleepHost = {
  readonly storage: DurableObjectStorage;
  readonly usageForSleep: (from: string, now: string) => Promise<SleepUsage>;
  /** The whole event log, corrections included. */
  readonly log: () => Promise<readonly Event[]>;
  /** The person's zone (the account's, else the server's). */
  readonly zone: () => Promise<string>;
  /** Appends system events (known ids are skipped); answers those that went in. */
  readonly insert: (inputs: readonly EventInput[], now: string) => Promise<readonly Event[]>;
  readonly logDecisions: (entries: readonly DecisionEntry[], now: string) => Promise<void>;
  /** The log's sequence: it moves with every event, the person's or the server's. */
  readonly seq: () => Promise<number>;
};

const laterOf = (a: string, b: null | string): string => (b !== null && b > a ? b : a);

/** The spells awake from a few hours before `at` up to how far use was known. */
const spellsAround = (uses: readonly DeviceUse[], at: string, knownUntil: string) => {
  const from = addMinutesIso(at, -SPELLS_BEFORE_MINUTES);
  return awakeSpells(
    uses
      .filter((use) => use.endAt > from && use.startAt < knownUntil)
      .map(({ endAt, startAt }) => ({ endAt, startAt })),
  );
};

/** The instant a decision is about: the start opened or discarded, the end written or undone. */
const instantOf = (
  decision: SleepDecision,
  { input, log }: { input: SleepInput; log: readonly Event[] },
) => {
  switch (decision.kind) {
    case "open":
    case "stop": {
      return decision.at;
    }
    case "reopen": {
      return log.find((event) => event.id === decision.stopEventId)?.occurredAt ?? input.now;
    }
    case "discard": {
      return input.activities.find((each) => each.id === decision.activityId)?.startAt ?? input.now;
    }
  }
};

/** The server's own sentence for a row (the screen words it from the rule and inputs instead). */
const EXPLANATIONS: Readonly<Record<SleepDecision["kind"], (at: string) => string>> = {
  discard: (at) =>
    `Not sleep: the rest that started at ${at} ended too soon to be a night's sleep.`,
  open: (at) => `Sleep started at ${at}: no use on any device since, as far as the phones told.`,
  reopen: (at) => `Sleep continued: the wake at ${at} was short and quiet followed it.`,
  stop: (at) => `Sleep ended at ${at}: a device was used.`,
};

/** One decision's row: its rule, the instant in the person's zone, and what it relied on. */
const entryOf = (
  decision: SleepDecision,
  { event, input, log }: { event: Event; input: SleepInput; log: readonly Event[] },
): DecisionEntry => {
  const at = instantOf(decision, { input, log });
  const knownUntil = laterOf(input.knownUntil ?? at, input.decidedUntil);
  const inputs: SleepLogInputs = {
    activityId: decision.kind === "open" ? event.id : decision.activityId,
    at,
    decidedUntil: input.decidedUntil,
    eventId: event.id,
    knownUntil,
    spells: spellsAround(input.uses, at, knownUntil),
    zone: input.zone,
  };
  return {
    explanation: EXPLANATIONS[decision.kind](at),
    inputs,
    kind: "sleep",
    outcome: "applied",
    rule: sleepRuleOf(decision.kind),
    taskId: null,
  };
};

/**
The rows of the decisions whose event went in (`events` has one per decision, in order): one
already in the log (a pass again on the same input) logs nothing.
*/
const entriesOf = (
  decisions: readonly SleepDecision[],
  {
    events,
    input,
    inserted,
    log,
  }: {
    events: readonly EventInput[];
    input: SleepInput;
    inserted: readonly Event[];
    log: readonly Event[];
  },
): readonly DecisionEntry[] => {
  const byId = new Map(inserted.map((event) => [event.id, event]));
  return decisions.flatMap((decision, index) => {
    const event = byId.get(events[index]?.id ?? "");
    return event === undefined ? [] : [entryOf(decision, { event, input, log })];
  });
};

/** A SHA-256 digest of a value's JSON. */
const digestOf = async (value: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** What a pass decides on, as `Held` compares it. */
type DecidedOn = {
  readonly decidedOn: string;
  readonly seq: number;
  readonly uses: readonly DeviceUse[];
  readonly zone: string;
};

const digestsOf = async ({ decidedOn, seq, uses, zone }: DecidedOn) => ({
  log: await digestOf({ seq, zone }),
  uses: await digestOf(uses),
  usesBefore: await digestOf(uses.filter((use) => use.startAt < decidedOn)),
});

/** 21:00 local on the day of `at`: the first instant a sleep can start after a day. */
const eveningOf = (at: string, zone: string): string =>
  wallClockInstant(formatInZone(at, zone, "yyyy-MM-dd"), `${String(BEDTIME_FROM_HOUR)}:00`, zone);

/**
Whether the last pass still holds: the same log and zone, and either the same uses with less known
than its horizon, or (all it followed decided for good, by day: noon to 21:00 local) only new use
after what it knew, and still before the evening. Nothing it can decide on changed, so the whole
log is not loaded again for it (each phone upload moves `knownUntil`).
*/
const isHeld = async (held: Held | undefined, now: DecidedOn): Promise<boolean> => {
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
Keeps the highest `knownUntil` decided with, read again just before the write: a pass that
overlapped this one (an upload's, waiting on a send) may have decided on more. Answers it.
*/
const keepDecidedUntil = async (
  storage: DurableObjectStorage,
  knownUntil: string,
): Promise<string> => {
  const kept = laterOf(knownUntil, (await storage.get<string>(DECIDED_UNTIL_KEY)) ?? null);
  await storage.put(DECIDED_UNTIL_KEY, kept);
  return kept;
};

/** Arms the next look and remembers it, so `alarm()` knows when sleep's own time has come. */
const armNextLook = async (storage: DurableObjectStorage, now: string, zone: string) => {
  const at = nextSleepCheckAt(now, zone);
  await storage.put(SLEEP_NEXT_AT_KEY, at);
  await armEarliest(storage, at);
};

/**
After a pass that read the log: remembers how far its decisions hold (as the log stands after its
own writes), so the next pass within that loads nothing.
*/
const hold = async (
  host: SleepHost,
  { decidedOn, input }: { decidedOn: Omit<DecidedOn, "seq">; input: SleepInput },
): Promise<void> => {
  const digests = await digestsOf({ ...decidedOn, seq: await host.seq() });
  const held: Held = { ...digests, decidedOn: decidedOn.decidedOn, ...sleepHorizon(input) };
  await host.storage.put(HELD_KEY, held);
};

/** Decides on the log as it stands, writes the events and the rows. Answers the ids written. */
const decideOn = async (
  host: SleepHost,
  { input, log, now }: { input: SleepInput; log: readonly Event[]; now: string },
): Promise<readonly string[]> => {
  const decisions = decideSleep(input);
  const events = sleepEvents(decisions, input);
  const inserted = await host.insert(events, now);
  await host.logDecisions(entriesOf(decisions, { events, input, inserted, log }), now);
  return inserted.map((event) => event.id);
};

/**
One pass of automatic sleep over the person's store at `now`: reads use from 36 hours back and
how far the phones have told, and unless the last pass that read the log still holds (`isHeld`),
decides on the log as it stands (`decideSleep`), appends the events through the system path and
logs each decision that wrote one, with what it relied on. Keeps the highest `knownUntil` it
decided with, and arms the next look. Without a phone that uploaded within a day, the rules' running
sleeps end where knowledge ended (once) and nothing is armed: its next upload starts again.
Answers the ids written. (A use that
leaves the 36 hours is not a change: it only ever concerns a night long decided.)
*/
export const runSleepPass = async (host: SleepHost, now: string): Promise<readonly string[]> => {
  const usesFrom = addMinutesIso(now, -USES_FOR_MINUTES);
  const { knownUntil, uses } = await host.usageForSleep(usesFrom, now);
  const zone = await host.zone();
  const decidedUntil = (await host.storage.get<string>(DECIDED_UNTIL_KEY)) ?? null;
  if (knownUntil === null) {
    await host.storage.delete(SLEEP_NEXT_AT_KEY);
    return await endWhereKnown(host, { decidedUntil, now, uses, usesFrom, zone });
  }
  const decidedOn = { decidedOn: laterOf(knownUntil, decidedUntil), uses, zone };
  const isSame = await isHeld(await host.storage.get<Held>(HELD_KEY), {
    ...decidedOn,
    seq: await host.seq(),
  });
  const made = isSame
    ? []
    : await decideAndHold(host, { decidedOn, decidedUntil, knownUntil, now, usesFrom });
  await keepDecidedUntil(host.storage, knownUntil);
  await armNextLook(host.storage, now, zone);
  return made;
};

/**
A pass with no phone fresh: the rules end their running sleeps where knowledge ended (see core's
`decideSleep`), once for each `decidedUntil`. Nothing is armed: the next phone upload starts again.
*/
const endWhereKnown = async (
  host: SleepHost,
  {
    decidedUntil,
    now,
    uses,
    usesFrom,
    zone,
  }: {
    decidedUntil: null | string;
    now: string;
    uses: readonly DeviceUse[];
    usesFrom: string;
    zone: string;
  },
): Promise<readonly string[]> => {
  if (decidedUntil === null || decidedUntil === (await host.storage.get(ENDED_AT_KEY))) {
    return [];
  }
  const log = await host.log();
  const input = sleepInputOf(log, { decidedUntil, knownUntil: null, now, uses, usesFrom, zone });
  const made = await decideOn(host, { input, log, now });
  await host.storage.put(ENDED_AT_KEY, decidedUntil);
  return made;
};

/** A pass that reads the log: decides, writes, and remembers how far that holds. */
const decideAndHold = async (
  host: SleepHost,
  {
    decidedOn,
    decidedUntil,
    knownUntil,
    now,
    usesFrom,
  }: {
    decidedOn: Omit<DecidedOn, "seq">;
    decidedUntil: null | string;
    knownUntil: string;
    now: string;
    usesFrom: string;
  },
): Promise<readonly string[]> => {
  const log = await host.log();
  const { uses, zone } = decidedOn;
  const input = sleepInputOf(log, { decidedUntil, knownUntil, now, uses, usesFrom, zone });
  const made = await decideOn(host, { input, log, now });
  await hold(host, { decidedOn, input });
  return made;
};

/** How soon sleep looks again after a pass that failed (as after any pass at night). */
const RETRY_MINUTES = 15;

/**
Sleep's part of `alarm()`: a pass once its own time has come; before that (another wait's alarm
fired first and took sleep's time with it) its time is armed again and nothing is read. A pass
that fails is logged and looked at again in 15 minutes: it never fails the alarm, whose retries
would run the pool and the queue again for it.
*/
export const sleepAtAlarm = async (
  storage: DurableObjectStorage,
  { now, pass }: { readonly now: string; readonly pass: () => Promise<unknown> },
): Promise<void> => {
  const nextAt = await storage.get<number>(SLEEP_NEXT_AT_KEY);
  if (nextAt === undefined) {
    return;
  }
  if (nextAt > Date.parse(now)) {
    await armEarliest(storage, nextAt);
    return;
  }
  try {
    await pass();
  } catch (error) {
    createLogger("info").error("The sleep pass at the alarm failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    const retryAt = Date.parse(now) + RETRY_MINUTES * 60_000;
    await storage.put(SLEEP_NEXT_AT_KEY, retryAt);
    await armEarliest(storage, retryAt);
  }
};

import {
  addMinutesIso,
  awakeSpells,
  decideSleep,
  type DeviceUse,
  type Event,
  type EventInput,
  type SleepDecision,
  sleepEvents,
  type SleepInput,
  sleepInputOf,
  type SleepLogInputs,
  sleepRuleOf,
} from "@pace/core";

import type { DecisionEntry } from "../shared/contract.ts";
import type { SleepUsage } from "./cloud-data.ts";

import { createLogger } from "../shared/logger.ts";
import { armEarliest, nextSleepCheckAt, SLEEP_CHECK_MINUTES } from "./alarm.ts";
import { type DecidedOn, heldOf, hold, isHeld, keptHold, usesAfter } from "./sleep-hold.ts";

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
The use a pass reads: from the anchor of the hold it may still be within, else from its own front
(36 hours back); `uses` are those of its own window, which it decides on.
*/
const readWindow = async (host: SleepHost, now: string) => {
  const usesFrom = addMinutesIso(now, -USES_FOR_MINUTES);
  const held = keptHold(await heldOf(host.storage), usesFrom);
  const read = await host.usageForSleep(held?.anchor ?? usesFrom, now);
  return {
    held,
    knownUntil: read.knownUntil,
    read,
    uses: usesAfter(read.uses, usesFrom),
    usesFrom,
  };
};

/**
One pass of automatic sleep over the person's store at `now`: reads use from 36 hours back (from
the hold's anchor while one lasts) and how far the phones have told, and unless the last pass that
read the log still holds (`isHeld`), decides on the log as it stands (`decideSleep`) with the use
of the last 36 hours, appends the events through the system path and logs each decision that
wrote one, with what it relied on. Keeps the highest `knownUntil` it decided with, and arms the
next look. Without a phone that uploaded within a day, the rules' running sleeps end where
knowledge ended (once) and nothing is armed: its next upload starts again. Answers the ids written.
*/
export const runSleepPass = async (host: SleepHost, now: string): Promise<readonly string[]> => {
  const made = await passOn(host, now);
  await completed(host.storage);
  return made;
};

/** The pass itself (see `runSleepPass`). */
const passOn = async (host: SleepHost, now: string): Promise<readonly string[]> => {
  const { held, knownUntil, read, uses, usesFrom } = await readWindow(host, now);
  const zone = await host.zone();
  const decidedUntil = (await host.storage.get<string>(DECIDED_UNTIL_KEY)) ?? null;
  if (knownUntil === null) {
    await host.storage.delete(SLEEP_NEXT_AT_KEY);
    return await endWhereKnown(host, { decidedUntil, now, uses, usesFrom, zone });
  }
  const decidedOn = { decidedOn: laterOf(knownUntil, decidedUntil), uses, zone };
  const isSame = await isHeld(held, { ...decidedOn, seq: await host.seq(), uses: read.uses });
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
  await hold(host.storage, { decidedOn, input, seq: await host.seq() });
  return made;
};

/** How soon sleep looks again after a pass that failed (as after any pass at night)... */
const RETRY_MINUTES = SLEEP_CHECK_MINUTES;

/** ...doubling while passes keep failing, up to this. */
const RETRY_MAX_MINUTES = 4 * 60;

/** Storage key of how many passes at the alarm have failed in a row. */
const FAILURES_KEY = "sleep:failures";

/** A pass completed: the next failure waits the shortest again. */
const completed = async (storage: DurableObjectStorage): Promise<void> => {
  if ((await storage.get(FAILURES_KEY)) !== undefined) {
    await storage.delete(FAILURES_KEY);
  }
};

/**
After a pass at the alarm failed: when sleep looks again, an hour on (as after any pass at night),
doubling with each failure in a row up to four hours, so a pass that keeps failing (and may load
the whole log each time) does not run every hour for good.
*/
const retryAtOf = async (storage: DurableObjectStorage, now: string): Promise<number> => {
  const failures = ((await storage.get<number>(FAILURES_KEY)) ?? 0) + 1;
  await storage.put(FAILURES_KEY, failures);
  const minutes = Math.min(RETRY_MINUTES * 2 ** (failures - 1), RETRY_MAX_MINUTES);
  return Date.parse(now) + minutes * 60_000;
};

/**
Sleep's part of `alarm()`: a pass once its own time has come; before that (another wait's alarm
fired first and took sleep's time with it) its time is armed again and nothing is read. A pass
that fails is logged and looked at again later (`retryAtOf`): it never fails the alarm, whose
retries would run the pool and the queue again for it.
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
    const retryAt = await retryAtOf(storage, now);
    await storage.put(SLEEP_NEXT_AT_KEY, retryAt);
    await armEarliest(storage, retryAt);
  }
};

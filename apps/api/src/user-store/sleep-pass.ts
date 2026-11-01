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

import { armEarliest, nextSleepCheckAt } from "./alarm.ts";

/** Storage key of the highest `knownUntil` a pass decided with: less known later undoes nothing. */
export const DECIDED_UNTIL_KEY = "sleep:decided-until";

/**
Storage key of when automatic sleep next looks (epoch ms): `alarm()` runs a pass only once it has
come, and arms it again when another wait's earlier alarm fired first.
*/
export const SLEEP_NEXT_AT_KEY = "sleep:next-at";

/** Storage key of a digest of what the last pass decided on: the same again decides nothing. */
const SEEN_KEY = "sleep:seen";

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

/** What a pass decides on, as a digest: the uses, how far they are known, the log, the zone. */
const digestOf = async (decidedOn: {
  readonly decidedUntil: null | string;
  readonly knownUntil: string;
  readonly seq: number;
  readonly uses: readonly DeviceUse[];
  readonly zone: string;
}): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(decidedOn));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
After a pass: keeps the highest `knownUntil` decided with, remembers what the next pass would
decide on if nothing changes (so it loads nothing), and arms the next look.
*/
const settle = async (
  host: SleepHost,
  {
    decidedOn,
    now,
  }: {
    decidedOn: Omit<Parameters<typeof digestOf>[0], "seq">;
    now: string;
  },
): Promise<void> => {
  const decidedUntil = await keepDecidedUntil(host.storage, decidedOn.knownUntil);
  const seen = await digestOf({ ...decidedOn, decidedUntil, seq: await host.seq() });
  await host.storage.put(SEEN_KEY, seen);
  await armNextLook(host.storage, now, decidedOn.zone);
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
how far the phones have told, and when any of that, the log or the zone changed since the last
pass, decides on the log as it stands (`decideSleep`), appends the events through the system
path and logs each decision that wrote one, with what it relied on. Keeps the highest
`knownUntil` it decided with, and arms the next look. Without a phone that uploaded within a day
nothing is decided and nothing is armed: its next upload starts again. Answers the ids written.
*/
export const runSleepPass = async (host: SleepHost, now: string): Promise<readonly string[]> => {
  const usesFrom = addMinutesIso(now, -USES_FOR_MINUTES);
  const { knownUntil, uses } = await host.usageForSleep(usesFrom, now);
  if (knownUntil === null) {
    await host.storage.delete(SLEEP_NEXT_AT_KEY);
    return [];
  }
  const zone = await host.zone();
  const decidedUntil = (await host.storage.get<string>(DECIDED_UNTIL_KEY)) ?? null;
  const decidedOn = { decidedUntil, knownUntil, uses, zone };
  const seen = await digestOf({ ...decidedOn, seq: await host.seq() });
  const log = seen === (await host.storage.get<string>(SEEN_KEY)) ? null : await host.log();
  const knowledge = { ...decidedOn, now, usesFrom };
  const made =
    log === null ? [] : await decideOn(host, { input: sleepInputOf(log, knowledge), log, now });
  await settle(host, { decidedOn, now });
  return made;
};

/**
Sleep's part of `alarm()`: a pass once its own time has come; before that (another wait's alarm
fired first and took sleep's time with it) its time is armed again and nothing is read.
*/
export const sleepAtAlarm = async (
  storage: DurableObjectStorage,
  { now, pass }: { readonly now: string; readonly pass: () => Promise<unknown> },
): Promise<void> => {
  const nextAt = await storage.get<number>(SLEEP_NEXT_AT_KEY);
  if (nextAt === undefined) {
    return;
  }
  await (nextAt <= Date.parse(now) ? pass() : armEarliest(storage, nextAt));
};

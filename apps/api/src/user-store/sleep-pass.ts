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
const DECIDED_UNTIL_KEY = "sleep:decided-until";

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
The rows of the decisions whose event went in (`sleepEvents` names one event per decision, in
order): one already in the log (a pass again on the same input) logs nothing.
*/
const entriesOf = (
  decisions: readonly SleepDecision[],
  {
    input,
    inserted,
    log,
  }: { input: SleepInput; inserted: readonly Event[]; log: readonly Event[] },
): readonly DecisionEntry[] => {
  const events = sleepEvents(decisions, input);
  const byId = new Map(inserted.map((event) => [event.id, event]));
  return decisions.flatMap((decision, index) => {
    const event = byId.get(events[index]?.id ?? "");
    return event === undefined ? [] : [entryOf(decision, { event, input, log })];
  });
};

/**
One pass of automatic sleep over the person's store at `now`: reads use from 36 hours back and
how far the phones have told, decides on the log as it stands (`decideSleep`), appends the events
through the system path and logs each decision that wrote one, with what it relied on. Keeps the
highest `knownUntil` it decided with, and arms the alarm for the next look. Without a phone that
uploaded within a day nothing is decided and nothing is armed: its next upload starts again.
Answers the ids of the events written.
*/
export const runSleepPass = async (host: SleepHost, now: string): Promise<readonly string[]> => {
  const usesFrom = addMinutesIso(now, -USES_FOR_MINUTES);
  const { knownUntil, uses } = await host.usageForSleep(usesFrom, now);
  if (knownUntil === null) {
    return [];
  }
  const zone = await host.zone();
  const decidedUntil = (await host.storage.get<string>(DECIDED_UNTIL_KEY)) ?? null;
  const log = await host.log();
  const input = sleepInputOf(log, { decidedUntil, knownUntil, now, uses, usesFrom, zone });
  const decisions = decideSleep(input);
  const inserted = await host.insert(sleepEvents(decisions, input), now);
  await host.logDecisions(entriesOf(decisions, { input, inserted, log }), now);
  await host.storage.put(DECIDED_UNTIL_KEY, laterOf(knownUntil, decidedUntil));
  await armEarliest(host.storage, nextSleepCheckAt(now, zone));
  return inserted.map((event) => event.id);
};

import { z } from "zod";

import type { Interval } from "./phone-use.ts";
import type { SleepDecision } from "./sleep-walk.ts";

/** What automatic sleep decides, in the order the decision log names them. */
const SLEEP_DECISION_KINDS = [
  "open",
  "stop",
  "reopen",
  "discard",
] as const satisfies readonly SleepDecision["kind"][];

type SleepDecisionKind = (typeof SLEEP_DECISION_KINDS)[number];

/** The decision log's rule for a sleep decision: `sleep.open`, `sleep.stop`… */
export const sleepRuleOf = (kind: SleepDecisionKind): string => `sleep.${kind}`;

/**
What a sleep decision's row keeps as its inputs: the instant it is about (the start opened, the
end written, the stop undone, the start of the rest discarded) in the person's zone, the event it
wrote, and what it relied on: how far use was known and the spells awake around it.
*/
export type SleepLogInputs = {
  readonly at: string;
  readonly zone: string;
  readonly eventId: string;
  readonly activityId: string;
  readonly knownUntil: string;
  readonly decidedUntil: null | string;
  readonly spells: readonly Interval[];
};

/** Only what the screen words is read; the rest is for the person reading the raw row. */
const SleepLogInputsSchema = z.object({ at: z.iso.datetime(), zone: z.string().min(1) });

/**
A sleep row of the decision log as a client words it: which decision, about which instant, in
which zone. `null` for a rule this client does not know or inputs it cannot read.
*/
export const readSleepDecision = (
  rule: string,
  inputs: unknown,
): null | { readonly kind: SleepDecisionKind; readonly at: string; readonly zone: string } => {
  const kind = SLEEP_DECISION_KINDS.find((each) => sleepRuleOf(each) === rule);
  const parsed = SleepLogInputsSchema.safeParse(inputs);
  return kind === undefined || !parsed.success
    ? null
    : { at: parsed.data.at, kind, zone: parsed.data.zone };
};

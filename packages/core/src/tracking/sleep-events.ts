import type { EventInput } from "../events/event-schema.ts";
import type { SleepDecision } from "./sleep-walk.ts";

import { sleepDiscardId, sleepReopenId, sleepStartId, sleepStopId } from "../ids.ts";
import { type SleepInput, startIdsUsed } from "./sleep-auto.ts";
import { AUTO_SLEEP_LABEL } from "./sleep-label.ts";

// The events automatic sleep's decisions write (sleep-auto.ts decides them).

const revoke = (id: string, targetId: string, now: string): EventInput => ({
  id,
  occurredAt: now,
  payload: { targetId },
  precision: "exact",
  source: "system",
  type: "event.revoked",
});

/** The stop ids an activity already has, in force or revoked: a new stop must not reuse one. */
const stopIdsOf = (input: SleepInput, activityId: string): readonly string[] => {
  const activity = input.activities.find((each) => each.id === activityId);
  return activity === undefined
    ? []
    : [
        ...(activity.stopEventId === null ? [] : [activity.stopEventId]),
        ...activity.revokedAutoStopIds,
      ];
};

const toEvent = (
  decision: SleepDecision,
  { input, usedStartIds }: { readonly input: SleepInput; readonly usedStartIds: readonly string[] },
): EventInput => {
  const { now } = input;
  switch (decision.kind) {
    case "open": {
      const id = sleepStartId(decision.night, decision.at, usedStartIds);
      return {
        id,
        occurredAt: decision.at,
        payload: { activityId: id, category: "sleep", label: AUTO_SLEEP_LABEL },
        precision: "approx",
        source: "system",
        type: "activity.started",
      };
    }
    case "stop": {
      return {
        id: sleepStopId(decision.activityId, decision.at, stopIdsOf(input, decision.activityId)),
        occurredAt: decision.at,
        payload: { activityId: decision.activityId },
        precision: "approx",
        source: "system",
        type: "activity.stopped",
      };
    }
    case "reopen": {
      return revoke(sleepReopenId(decision.stopEventId), decision.stopEventId, now);
    }
    case "discard": {
      return revoke(sleepDiscardId(decision.startEventId), decision.startEventId, now);
    }
  }
};

/**
The events the decisions write, through the system path: the start (labelled "Sleep"; the
screen words it), stops at the instant use ended the sleep, and revocations for a reopen (of
the stop) and a discard (of the start). Ids follow from the night, the instant and the event
followed up, so deciding again on the same input names the same events.
*/
export const sleepEvents = (
  decisions: readonly SleepDecision[],
  input: SleepInput,
): readonly EventInput[] => {
  const usedStartIds = startIdsUsed(input, decisions);
  return decisions.map((decision) => toEvent(decision, { input, usedStartIds }));
};

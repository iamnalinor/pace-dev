import {
  err,
  type Event,
  type EventInput,
  ok,
  parseEvent,
  type Result,
  retiredAutoMissRevokes,
} from "@pace/core";

import { createLogger } from "../shared/logger.ts";

/** The device the store's own events are written as. */
export const SERVER_DEVICE_ID = "server";

/** The code a system event that does not parse is logged under (Workers Logs indexes it). */
const SYSTEM_UNPARSABLE = "system/unparsable";

/**
The store's own events, stamped, all or none: one that does not parse is the server's bug, not the
person's, and fails the whole group with the reason (a dropped revoke left its miss standing).
*/
export const stampSystem = (
  inputs: readonly EventInput[],
  now: string,
): Result<readonly Event[], string> => {
  const stamped: Event[] = [];
  for (const input of inputs) {
    const parsed = parseEvent({ ...input, deviceId: SERVER_DEVICE_ID, recordedAt: now });
    if (!parsed.ok) {
      return err(`system event ${input.type} does not parse: ${parsed.error}`);
    }
    stamped.push(parsed.value);
  }
  return ok(stamped);
};

/**
Logs a group of the store's own events that did not parse and was left out. It is reported, not
thrown: thrown inside a push or an alarm it would refuse every write to the store for as long as
the state that makes it lasts, and a client resends its outbox on every sync (bug-lessons 184).
*/
const reportUnparsable = (where: string, reason: string): void => {
  createLogger("info").error("A system event does not parse; left out", {
    code: SYSTEM_UNPARSABLE,
    reason,
    where,
  });
};

/**
The store's own events as one group, stamped, or none when one of them does not parse: that group
is reported and left out (a derive step, a sleep pass), and the rest of the write goes on.
*/
export const stampedOrNone = (
  inputs: readonly EventInput[],
  now: string,
  where: string,
): readonly Event[] => {
  const stamped = stampSystem(inputs, now);
  if (!stamped.ok) {
    reportUnparsable(where, stamped.error);
    return [];
  }
  return stamped.value;
};

/**
A client's screened batch with the revokes of the automatic misses an older client pushed in it
(feedback 5), to be written together: no device pulls a miss without its revoke, and no crash
between two writes leaves one without it. A miss already in the log (`known`) is not touched. A
miss whose revoke does not parse is left out with it (the pair goes in whole or not at all) and
reported; the rest of the batch still goes in.
*/
export const withRetiredMisses = (
  events: readonly Event[],
  {
    known,
    now,
    revokesOf = retiredAutoMissRevokes,
  }: {
    readonly known: ReadonlySet<string>;
    readonly now: string;
    /** The revokes of a batch's old misses; tests pass one that writes a bad one. */
    readonly revokesOf?: typeof retiredAutoMissRevokes;
  },
): readonly Event[] => {
  const kept: Event[] = [];
  const revokes: Event[] = [];
  for (const event of events) {
    const stamped = known.has(event.id) ? ok([]) : stampSystem(revokesOf([event], now), now);
    if (stamped.ok) {
      kept.push(event);
      revokes.push(...stamped.value);
    } else {
      reportUnparsable(`retire ${event.id}`, stamped.error);
    }
  }
  return [...kept, ...revokes];
};

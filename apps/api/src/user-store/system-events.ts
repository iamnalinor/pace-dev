import { type Event, type EventInput, parseEvent, retiredAutoMissRevokes } from "@pace/core";

/** The device the store's own events are written as. */
export const SERVER_DEVICE_ID = "server";

/**
The store's own events, stamped. One that does not parse is the server's bug, not the person's:
it fails loudly instead of being dropped (a dropped revoke left its miss standing).
*/
export const stampSystem = (inputs: readonly EventInput[], now: string): readonly Event[] =>
  inputs.map((input) => {
    const parsed = parseEvent({ ...input, deviceId: SERVER_DEVICE_ID, recordedAt: now });
    if (!parsed.ok) {
      throw new Error(`system event ${input.type} does not parse: ${parsed.error}`);
    }
    return parsed.value;
  });

/**
A client's screened batch with the revokes of the automatic misses an older client pushed in it
(feedback 5), to be written together: no device pulls a miss without its revoke, and no crash
between two writes leaves one without it. A miss already in the log (`known`) is not touched.
*/
export const withRetiredMisses = (
  events: readonly Event[],
  known: ReadonlySet<string>,
  now: string,
): readonly Event[] => [
  ...events,
  ...stampSystem(
    retiredAutoMissRevokes(
      events.filter((event) => !known.has(event.id)),
      now,
    ),
    now,
  ),
];

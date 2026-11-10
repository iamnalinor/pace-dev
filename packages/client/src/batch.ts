import { err, type Event, newId, ok, parseEvent, type Result } from "@pace/core";

/** What the store fills in when a caller leaves it out (`DispatchInput` in `state.ts`). */
type Envelope = {
  readonly deviceId?: string | undefined;
  readonly id?: string | undefined;
  readonly recordedAt?: string | undefined;
};

type Defaults = { readonly deviceId: string; readonly recordedAt: string; readonly source: string };

const envelope = (input: Envelope, defaults: Defaults): unknown => ({
  precision: "exact",
  source: defaults.source,
  ...input,
  deviceId: input.deviceId ?? defaults.deviceId,
  id: input.id ?? newId(),
  recordedAt: input.recordedAt ?? defaults.recordedAt,
});

/**
One write's instant: every event of a batch is recorded at the same instant, and a batch after
another one on this device at a later one (a millisecond on when the clock has not moved), so
`deviceId` + `recordedAt` names the write. History shows a write as one row with one Undo (owner
R27-05, QA round 28 R28-05).
*/
export const batchInstant = (now: string, previous: null | string): string =>
  previous !== null && Date.parse(now) <= Date.parse(previous)
    ? new Date(Date.parse(previous) + 1).toISOString()
    : now;

/** A batch's inputs as events, all recorded at its instant; refused whole on a bad or known id. */
export const parseBatch = (
  inputs: readonly Envelope[],
  defaults: Defaults,
  isKnown: (id: string) => boolean,
): Result<readonly Event[], string> => {
  const events: Event[] = [];
  const ids = new Set<string>();
  for (const input of inputs) {
    const parsed = parseEvent(envelope(input, defaults));
    if (!parsed.ok) {
      return parsed;
    }
    const { id } = parsed.value;
    if (ids.has(id) || isKnown(id)) {
      return err("event/duplicate");
    }
    ids.add(id);
    events.push(parsed.value);
  }
  return ok(events);
};

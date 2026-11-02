import type { Event } from "./event-schema.ts";

/** What places an event in the canonical order. */
type Placed = Pick<Event, "id" | "occurredAt">;

/**
The canonical order of two events: by `occurredAt`, then by `id` (code-unit order, so a ULID sorts
before a system id at the same instant). Anything that predicts what the materializer will make
of events at one instant compares with this, never with its own rule.
*/
export const compareEvents = (a: Placed, b: Placed): number => {
  if (a.occurredAt !== b.occurredAt) {
    return a.occurredAt < b.occurredAt ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
};

/** Canonical order: `occurredAt`, then `id`. Stable and pure (returns a new array). */
export const sortEvents = (events: readonly Event[]): readonly Event[] =>
  events.toSorted(compareEvents);

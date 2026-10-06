import type { Event } from "./event-schema.ts";

const compare = (a: Event, b: Event): number => {
  if (a.occurredAt !== b.occurredAt) {
    return a.occurredAt < b.occurredAt ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
};

/** Canonical order: `occurredAt`, then `id`. Stable and pure (returns a new array). */
export const sortEvents = (events: readonly Event[]): readonly Event[] => events.toSorted(compare);

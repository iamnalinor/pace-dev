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

/** The first index whose item comes after `item` (after every equal one): a binary search. */
const upperBound = <T>(sorted: readonly T[], item: T, compare: (a: T, b: T) => number): number => {
  const search = (low: number, high: number): number => {
    if (low >= high) {
      return low;
    }
    const middle = Math.floor((low + high) / 2);
    return compare(sorted[middle] as T, item) <= 0 ? search(middle + 1, high) : search(low, middle);
  };
  return search(0, sorted.length);
};

/**
`sorted` (already in `compare` order) with `fresh` merged in: the same array, item for item, as a
stable sort of `[...sorted, ...fresh]`, so an item equal to one already there goes after it. Only
what comes after the first fresh item is sorted again; appending to the end costs a binary search
and a copy, not a sort of the whole (bug-lessons class 55).
*/
export const mergeSorted = <T>(
  sorted: readonly T[],
  fresh: readonly T[],
  compare: (a: T, b: T) => number,
): readonly T[] => {
  const incoming = fresh.toSorted(compare);
  const [first] = incoming;
  if (first === undefined) {
    return sorted;
  }
  const cut = upperBound(sorted, first, compare);
  const after = sorted.slice(cut);
  return after.length === 0
    ? [...sorted, ...incoming]
    : [...sorted.slice(0, cut), ...[...after, ...incoming].toSorted(compare)];
};

/** `mergeSorted` in the canonical order: what `sortEvents([...sorted, ...fresh])` answers. */
export const mergeEvents = (sorted: readonly Event[], fresh: readonly Event[]): readonly Event[] =>
  mergeSorted(sorted, fresh, compareEvents);

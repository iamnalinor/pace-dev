import { type Event, type EventOf, EventSchema } from "../events/event-schema.ts";
import { sortEvents } from "../events/sort.ts";

export type Reducer<S> = (state: S, event: Event) => S;

type Revocation = EventOf<"event.revoked">;
type Amendment = EventOf<"event.amended">;

export const isCorrection = (event: Event): event is Amendment | Revocation =>
  event.type === "event.amended" || event.type === "event.revoked";

/** Left fold over events: the one place `reduce` is the honest name for the job. */
const fold = <S>(events: readonly Event[], reducer: Reducer<S>, initial: S): S =>
  // eslint-disable-next-line unicorn/no-array-reduce -- a fold is what a materializer is
  events.reduce((state, event) => reducer(state, event), initial);

const groupByTarget = <T extends Amendment | Revocation>(
  corrections: readonly T[],
): ReadonlyMap<string, readonly T[]> => {
  const groups = new Map<string, readonly T[]>();
  for (const correction of corrections) {
    const key = correction.payload.targetId;
    // eslint-disable-next-line functional/immutable-data -- local accumulator that never escapes
    groups.set(key, [...(groups.get(key) ?? []), correction]);
  }
  return groups;
};

/**
A revocation is active unless an active revocation targets it (so revoking a revocation
restores the original). A cycle (two revocations revoking each other) counts as inactive.
*/
const isActiveRevocation = (
  revocation: Revocation,
  revokers: ReadonlyMap<string, readonly Revocation[]>,
  trail: ReadonlySet<string>,
): boolean => {
  if (trail.has(revocation.id)) {
    return false;
  }
  const next = new Set(trail).add(revocation.id);
  return (revokers.get(revocation.id) ?? []).every(
    (other) => !isActiveRevocation(other, revokers, next),
  );
};

const revokedIds = (revocations: readonly Revocation[]): ReadonlySet<string> => {
  const revokers = groupByTarget(revocations);
  return new Set(
    revocations
      .filter((revocation) => isActiveRevocation(revocation, revokers, new Set()))
      .map((revocation) => revocation.payload.targetId),
  );
};

/** Shallow-merges the patches in order; an amendment that makes the event invalid is ignored. */
const patched = (event: Event, amendments: readonly Amendment[]): Event => {
  const applyPatch = (current: Event, amendment: Amendment): Event => {
    const parsed = EventSchema.safeParse({
      ...current,
      payload: { ...current.payload, ...amendment.payload.patch },
    });
    return parsed.success ? parsed.data : current;
  };
  // eslint-disable-next-line unicorn/no-array-reduce -- patches fold onto the event in order
  return amendments.reduce((current, amendment) => applyPatch(current, amendment), event);
};

/**
Applies corrections: revoked events disappear, amendments patch their target's payload
(in `occurredAt` order). Corrections apply regardless of their own `occurredAt`, can
themselves be revoked, and are never part of the output. Unknown targets are ignored.
*/
export const effectiveEvents = (events: readonly Event[]): readonly Event[] => {
  const revoked = revokedIds(
    events.filter((event): event is Revocation => event.type === "event.revoked"),
  );
  const amendments = groupByTarget(
    sortEvents(events).filter(
      (event): event is Amendment => event.type === "event.amended" && !revoked.has(event.id),
    ),
  );
  return events
    .filter((event) => !isCorrection(event) && !revoked.has(event.id))
    .map((event) => patched(event, amendments.get(event.id) ?? []));
};

/** Full rebuild: corrections applied, canonical order, folded from `initial`. */
export const materialize = <S>(events: readonly Event[], reducer: Reducer<S>, initial: S): S =>
  fold(sortEvents(effectiveEvents(events)), reducer, initial);

export type MaterializeOptions<S> = {
  readonly reducer: Reducer<S>;
  readonly initial: S;
};

/** State as of `atIso`: only events that occurred by then, but every correction applies. */
export const materializeAt = <S>(
  events: readonly Event[],
  atIso: string,
  options: MaterializeOptions<S>,
): S =>
  fold(
    sortEvents(effectiveEvents(events).filter((event) => event.occurredAt <= atIso)),
    options.reducer,
    options.initial,
  );

/** Incremental path for an event that arrives in order; corrections need `materialize`. */
export const apply = <S>(state: S, event: Event, reducer: Reducer<S>): S =>
  isCorrection(event) ? state : reducer(state, event);

/** True when `incoming` cannot be applied incrementally on top of the last applied event. */
export const shouldRematerialize = (
  lastAppliedOccurredAt: null | string,
  incoming: Event,
): boolean =>
  isCorrection(incoming) ||
  (lastAppliedOccurredAt !== null && incoming.occurredAt < lastAppliedOccurredAt);

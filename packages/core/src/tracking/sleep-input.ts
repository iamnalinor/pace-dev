import type { Event, EventOf } from "../events/event-schema.ts";
import type { DeviceUse, MainStart, SleepActivity, SleepInput } from "./sleep-auto.ts";

import { compareEvents } from "../events/sort.ts";
import { isAutoSleepId, sleepNightOf } from "../ids.ts";
import { effectiveEvents, materialize } from "../materialize/materializer.ts";
import { isRestClass } from "./categories.ts";
import { type Activity, INITIAL_TIME_STATE, type TimeState } from "./model.ts";
import { timeReducer } from "./time-reducer.ts";

// What automatic sleep reads from the person's log: one builder for the server's pass and the
// rules' own tests, so the two can never read the log differently (class 1).

/** What is known beside the log: use, how far it is known, when and where the pass runs. */
export type SleepKnowledge = {
  readonly uses: readonly DeviceUse[];
  readonly knownUntil: null | string;
  /** The highest `knownUntil` an earlier pass decided with (`null` before the first). */
  readonly decidedUntil: null | string;
  /** The `from` the uses were read from. */
  readonly usesFrom: string;
  readonly now: string;
  readonly zone: string;
};

/** Which activities' edits are read: those a pass can still walk or count (see `sleepActivitiesOf`). */
type Relevant = (activity: Activity | undefined) => boolean;

/**
The activities whose start or end an `activity.adjusted` of the person's (in force) actually
changed: compared with the value they saw, the state of the log as it stood when the edit was
recorded. Saving the edit sheet with the end as it was is not setting the end; nor does a start
recorded later (which closed the activity at the same instant) undo an edit made before it.
*/
const changedByPerson = (
  log: readonly Event[],
  {
    effective,
    relevant,
    state,
  }: { effective: readonly Event[]; relevant: Relevant; state: TimeState },
): { readonly starts: ReadonlySet<string>; readonly ends: ReadonlySet<string> } => {
  const inForce = new Map(effective.map((event) => [event.id, event]));
  const isPersonsEdit = (event: Event | undefined): event is EventOf<"activity.adjusted"> =>
    event?.type === "activity.adjusted" && event.source !== "system";
  const edits = log
    .map((recorded, index) => ({ event: inForce.get(recorded.id), index }))
    .filter(
      (edit): edit is { event: EventOf<"activity.adjusted">; index: number } =>
        isPersonsEdit(edit.event) && relevant(state.activities[edit.event.payload.activityId]),
    );
  const changes = edits.map(({ event, index }) => {
    const { activityId, endAt, startAt } = event.payload;
    const seen = materialize(log.slice(0, index), timeReducer, INITIAL_TIME_STATE).activities[
      activityId
    ];
    return {
      activityId,
      isEnd: endAt !== undefined && endAt !== seen?.endAt,
      isStart: startAt !== undefined && startAt !== seen?.startAt,
    };
  });
  return {
    ends: new Set(changes.filter((change) => change.isEnd).map((change) => change.activityId)),
    starts: new Set(changes.filter((change) => change.isStart).map((change) => change.activityId)),
  };
};

/** The effective stop that put an activity's end where it is. */
const stopOf = (effective: readonly Event[], activityId: string, endAt: null | string) =>
  effective.find(
    (event) =>
      event.type === "activity.stopped" &&
      event.payload.activityId === activityId &&
      event.occurredAt === endAt,
  );

/** Where an activity's start event put its start: a live start's instant, a logged block's `startAt`. */
const startEventAtOf = (effective: readonly Event[], originEventId: string) => {
  const origin = effective.find((event) => event.id === originEventId);
  return origin?.type === "activity.logged" ? origin.payload.startAt : origin?.occurredAt;
};

/** Ids of the events out of force that a non-system `event.revoked` targets. */
const revokedByPerson = (log: readonly Event[], effectiveIds: ReadonlySet<string>) =>
  new Set(
    log
      .filter((event) => event.source !== "system")
      .map((event) => (event.type === "event.revoked" ? event.payload.targetId : ""))
      .filter((id) => id !== "" && !effectiveIds.has(id)),
  );

/** Automatic stops of an activity that are no longer in force, whoever revoked them. */
const revokedStopsOf = (
  log: readonly Event[],
  {
    activityId,
    effectiveIds,
  }: { readonly activityId: string; readonly effectiveIds: ReadonlySet<string> },
): readonly EventOf<"activity.stopped">[] =>
  log.filter(
    (event): event is EventOf<"activity.stopped"> =>
      event.type === "activity.stopped" &&
      event.payload.activityId === activityId &&
      isAutoSleepId(event.id) &&
      !effectiveIds.has(event.id),
  );

/**
Every effective activity as automatic sleep reads it: the event that started it and the one that
stopped it, the automatic stops no longer in force (by id) and the instants of those the person
undid, and whether the person changed its start or its end. Who changed what is read only for
the sleeps and automatic starts still running or ending at or after `since` (the pass's uses
start): the rules never look at an older one, and each edit costs a look at the log as it was.
*/
export const sleepActivitiesOf = (log: readonly Event[], since = ""): readonly SleepActivity[] =>
  activitiesOf(log, { ...readOf(log), since });

/** The log read once: the events in force and the state they make (the costly part of a pass). */
type LogRead = { readonly effective: readonly Event[]; readonly state: TimeState };

const readOf = (log: readonly Event[]): LogRead => ({
  effective: effectiveEvents(log),
  state: materialize(log, timeReducer, INITIAL_TIME_STATE),
});

/** `sleepActivitiesOf` on a log already read. */
const activitiesOf = (
  log: readonly Event[],
  { effective, since, state }: LogRead & { readonly since: string },
): readonly SleepActivity[] => {
  const effectiveIds = new Set(effective.map((event) => event.id));
  const personRevoked = revokedByPerson(log, effectiveIds);
  const changed = changedByPerson(log, {
    effective,
    relevant: (activity) =>
      activity !== undefined &&
      (activity.category === "sleep" || isAutoSleepId(activity.originEventId)) &&
      (activity.endAt === null || activity.endAt >= since),
    state,
  });
  return Object.values(state.activities).map((activity) => {
    const stop = stopOf(effective, activity.id, activity.endAt);
    const revokedStops = revokedStopsOf(log, { activityId: activity.id, effectiveIds });
    return {
      category: activity.category,
      endAt: activity.endAt,
      id: activity.id,
      isAutoStart: isAutoSleepId(activity.originEventId),
      isAutoStop: stop !== undefined && isAutoSleepId(stop.id),
      isEndAmendedByPerson: changed.ends.has(activity.id),
      isStartAmendedByPerson: changed.starts.has(activity.id),
      personRevokedStopsAt: revokedStops
        .filter((event) => personRevoked.has(event.id))
        .map((event) => event.occurredAt),
      revokedAutoStopIds: revokedStops.map((event) => event.id),
      startAt: activity.startAt,
      startEventAt: startEventAtOf(effective, activity.originEventId) ?? activity.startAt,
      startEventId: activity.originEventId,
      stopEventId: stop?.id ?? null,
    };
  });
};

/** The activity an event of the person's records an instant of, and those instants. */
const recordedBy = (event: Event): null | { activityId: string; instants: readonly string[] } => {
  if (event.source === "system") {
    return null;
  }
  if (event.type === "activity.started" || event.type === "activity.stopped") {
    return { activityId: event.payload.activityId, instants: [event.occurredAt] };
  }
  if (event.type === "activity.logged") {
    const { activityId, endAt, startAt } = event.payload;
    return { activityId, instants: [startAt, endAt] };
  }
  return event.type === "activity.adjusted"
    ? {
        activityId: event.payload.activityId,
        instants: [event.payload.startAt, event.payload.endAt].filter(
          (instant): instant is string => instant !== undefined,
        ),
      }
    : null;
};

/**
The instants the person recorded they were at something: a start or a stop of theirs, a logged
block's bounds, a bound they moved. Not the server's own, and not those of a rest or a sleep
(Rest-class activities bound automatic sleep by their own rules: a sleep the person starts keeps
the spell they started it from, a rest moves a start past its end).
*/
const personMarksOf = (effective: readonly Event[], state: TimeState): readonly string[] =>
  effective
    .flatMap((event) => {
      const recorded = recordedBy(event);
      const activity = recorded === null ? undefined : state.activities[recorded.activityId];
      return recorded === null || activity === undefined || isRestClass(activity.category)
        ? []
        : recorded.instants;
    })
    .toSorted((a, b) => a.localeCompare(b));

/**
The live starts of a main activity (not alongside) in force, but the rules' own: each closes the
one running, whoever recorded it (the materializer closes at every main start, so one the server
recorded for the person, like Attend answered in the feed, counts too). In the canonical order.
*/
const mainStartsOf = (effective: readonly Event[]): readonly MainStart[] =>
  effective
    .filter(
      (event): event is EventOf<"activity.started"> =>
        event.type === "activity.started" &&
        !isAutoSleepId(event.id) &&
        event.payload.alongside !== true,
    )
    .toSorted(compareEvents)
    .map((event) => ({ at: event.occurredAt, id: event.id }));

/** Automatic sleep starts in the log. */
const autoStarts = (log: readonly Event[]) =>
  log.filter((event) => event.type === "activity.started" && isAutoSleepId(event.id));

/**
The rules' whole input from the person's log and what is known beside it: every effective
activity, the instants the person recorded and where their starts close, the automatic starts no
longer in force, and those the person deleted with their night.
*/
export const sleepInputOf = (log: readonly Event[], knowledge: SleepKnowledge): SleepInput => {
  const read = readOf(log);
  const { effective, state } = read;
  const effectiveIds = new Set(effective.map((event) => event.id));
  const personRevoked = revokedByPerson(log, effectiveIds);
  const revoked = autoStarts(log).filter((event) => !effectiveIds.has(event.id));
  return {
    ...knowledge,
    activities: activitiesOf(log, { ...read, since: knowledge.usesFrom }),
    mainStarts: mainStartsOf(effective),
    personMarks: personMarksOf(effective, state),
    personRevokedAutoStarts: revoked
      .filter((event) => personRevoked.has(event.id))
      .map((event) => ({
        night: sleepNightOf(event.occurredAt, knowledge.zone),
        startEventId: event.id,
      })),
    revokedAutoStartIds: revoked.map((event) => event.id),
  };
};

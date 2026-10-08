import {
  apply,
  coreReducer,
  type CoreState,
  err,
  type Event,
  type EventInput,
  INITIAL_CORE_STATE,
  isCorrection,
  materialize,
  newId,
  ok,
  parseEvent,
  parsePresetDefinition,
  type Result,
  shouldRematerialize,
  sortEvents,
  type Task,
  validateEventInput,
} from "@pace/core";

import type { ApplyError, ApplyMeta, RpcState, RpcTask } from "../shared/contract.ts";

/**
The state the Durable Object answers from: the core slices folded from the log, with the
bookkeeping that decides whether the next batch can be applied incrementally.
*/
export type Materialized = {
  readonly state: CoreState;
  /** Every id in the log, corrections and revoked events included. */
  readonly ids: ReadonlySet<string>;
  /** `occurredAt` of the last effective event folded in; the incremental-apply guard. */
  readonly lastAppliedOccurredAt: null | string;
  /** The log sequence the state was built at; a different log seq means the cache is stale. */
  readonly seq: number;
};

export type Log = {
  readonly events: readonly Event[];
  readonly seq: number;
};

/** Full rebuild from the whole log: corrections applied, canonical order. */
export const rebuild = (log: Log): Materialized => ({
  ids: new Set(log.events.map((event) => event.id)),
  lastAppliedOccurredAt: materialize(log.events, lastOccurredAt, null),
  seq: log.seq,
  state: materialize(log.events, coreReducer, INITIAL_CORE_STATE),
});

/** A reducer that only remembers the instant of the last event; `materialize` orders them. */
const lastOccurredAt = (_state: null | string, event: Event): null | string => event.occurredAt;

/**
True when `fresh` can be folded on top of `current`: none of it is a correction and none
of it occurred before what is already applied (the plan's materialization rule).
*/
export const canApplyInOrder = (current: Materialized, fresh: readonly Event[]): boolean => {
  const [first] = sortEvents(fresh);
  return (
    first === undefined ||
    (!shouldRematerialize(current.lastAppliedOccurredAt, first) &&
      fresh.every((event) => !isCorrection(event)))
  );
};

/** The incremental path: `fresh` is in order and free of corrections (`canApplyInOrder`). */
export const applyInOrder = (
  current: Materialized,
  fresh: readonly Event[],
  seq: number,
): Materialized => {
  const sorted = sortEvents(fresh);
  let state = current.state;
  for (const event of sorted) {
    state = apply(state, event, coreReducer);
  }
  return {
    ids: new Set([...current.ids, ...sorted.map((event) => event.id)]),
    lastAppliedOccurredAt: sorted.at(-1)?.occurredAt ?? current.lastAppliedOccurredAt,
    seq,
    state,
  };
};

/** The entities a batch of events may have changed, for the projection writer. */
export type Touched = {
  readonly taskIds: ReadonlySet<string>;
  readonly projectIds: ReadonlySet<string>;
  readonly presetIds: ReadonlySet<string>;
};

type Entity = readonly [keyof Touched, string];

/**
The entity an event is about, told apart by the payload keys: every task and focus event
carries `taskId`, project events `projectId` (checked after the task events, which may
carry one too), preset events `id`. Settings and corrections name none.
*/
const entityOf = (event: Event): Entity | undefined => {
  if ("taskId" in event.payload) {
    // An activity names a task only when the time was spent on one.
    const { taskId } = event.payload;
    return taskId === undefined || taskId === null ? undefined : ["taskIds", taskId];
  }
  if ("projectId" in event.payload) {
    return ["projectIds", event.payload.projectId];
  }
  return "id" in event.payload ? ["presetIds", event.payload.id] : undefined;
};

const idsOf = (events: readonly Event[], key: keyof Touched): ReadonlySet<string> =>
  new Set(
    events
      .map((event) => entityOf(event))
      .filter((entity): entity is Entity => entity?.[0] === key)
      .map((entity) => entity[1]),
  );

/** Corrections name no entity: they force a rebuild, which rewrites every row anyway. */
export const touchedBy = (events: readonly Event[]): Touched => ({
  presetIds: idsOf(events, "presetIds"),
  projectIds: idsOf(events, "projectIds"),
  taskIds: idsOf(events, "taskIds"),
});

export type Prepared = {
  readonly events: readonly Event[];
  /** The state after the batch, folded in order (a correction leaves it unchanged). */
  readonly state: CoreState;
};

/** A correction must name something that exists: in the log, or earlier in the same batch. */
const hasTarget = (input: EventInput, ids: ReadonlySet<string>, batch: readonly Event[]) =>
  !isCorrectionInput(input) ||
  ids.has(input.payload.targetId) ||
  batch.some((event) => event.id === input.payload.targetId);

const isCorrectionInput = (
  input: EventInput,
): input is Extract<EventInput, { readonly type: "event.amended" | "event.revoked" }> =>
  input.type === "event.amended" || input.type === "event.revoked";

const stamp = (input: EventInput, meta: ApplyMeta): Result<Event, string> =>
  parseEvent({
    ...input,
    deviceId: meta.deviceId,
    id: input.id ?? newId(),
    recordedAt: meta.now,
    source: meta.source,
  });

/**
Validates a batch against the state as it unfolds (an input sees the effect of the ones
before it), stamps the envelope and folds the result. Nothing is written here: the
store writes what comes back, or returns the preview for a dry run.
*/
export const prepareBatch = (
  current: Materialized,
  inputs: readonly EventInput[],
  meta: ApplyMeta,
): Result<Prepared, ApplyError> => {
  let state = current.state;
  const events: Event[] = [];
  for (const [index, input] of inputs.entries()) {
    const checked = validateEventInput(state, input, meta.now);
    if (!checked.ok) {
      return err({ code: checked.error, index });
    }
    if (!hasTarget(input, current.ids, events)) {
      return err({ code: "event/not-found", index });
    }
    const event = stamp(checked.value, meta);
    if (!event.ok) {
      return err({ code: "event/invalid", index });
    }
    events.push(event.value);
    state = coreReducer(state, event.value);
  }
  return ok({ events, state });
};

const toRpcTask = (task: Task): RpcTask => {
  if (task.overrides === null) {
    return { ...task, overrides: null };
  }
  const overrides = parsePresetDefinition(task.overrides);
  return { ...task, overrides: overrides.ok ? overrides.value : null };
};

/** The state as it crosses RPC: overrides validated into their typed shape (see `RpcState`). */
export const toRpcState = (state: CoreState): RpcState => ({
  ...state,
  tasks: {
    byId: Object.fromEntries(
      Object.entries(state.tasks.byId).map(([id, task]) => [id, toRpcTask(task)]),
    ),
  },
});

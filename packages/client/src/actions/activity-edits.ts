import {
  type ActivityCategory,
  activityLabel,
  err,
  type Event,
  newId,
  ok,
  taskById,
} from "@pace/core";

import type { ActivityEntry, ActivityTarget } from "./activity-edit-types.ts";

import { editInputs, moveChange } from "./activity-edit-inputs.ts";
import {
  type ActionDeps,
  type ActionError,
  type ActionResult,
  emit,
  fromStore,
  stamp,
} from "./deps.ts";

export type { ActivityEntry, ActivityTarget } from "./activity-edit-types.ts";

export type PastActivity = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly expectMinutes?: null | number;
  readonly startAt: string;
  readonly endAt: string;
  readonly taskId?: string | undefined;
};

/** What the Day screen does to blocks: log a past one, move it, rename it, save its sheet. */
export type EditActions = {
  readonly logPast: (activity: PastActivity) => ActionResult;
  /** The Day sheet's save: logs a new block, or moves and renames an existing one. */
  readonly saveActivity: (target: ActivityTarget, entry: ActivityEntry) => ActionResult;
  readonly adjustActivity: (
    activityId: string,
    change: { readonly startAt?: string; readonly endAt?: string },
  ) => ActionResult;
  readonly relabelActivity: (
    activityId: string,
    change: {
      readonly label?: string;
      readonly category?: ActivityCategory;
      readonly taskId?: null | string;
      readonly expectMinutes?: null | number;
    },
  ) => ActionResult;
  /** "Still doing this?" answered yes: the next ask moves on, the Expect stays. */
  readonly stillGoing: (activityId: string) => ActionResult;
  /** Takes a block off the ledger by revoking the event that made it (History restores it). */
  readonly deleteActivity: (activityId: string) => ActionResult;
};

const timeOf = (deps: ActionDeps) => deps.state.store.getState().time;
const hasUnknownTask = (deps: ActionDeps, taskId: null | string | undefined): boolean =>
  taskId !== null &&
  taskId !== undefined &&
  taskById(deps.state.store.getState().tasks, taskId) === undefined;

/** After now: a block is the past, logged or moved; the future is not tracked yet. */
const isAhead = (deps: ActionDeps, at: string | undefined): boolean =>
  at !== undefined && Date.parse(at) > Date.parse(deps.clock.now());

export const logPast = async (deps: ActionDeps, activity: PastActivity): ActionResult => {
  const label = activityLabel(activity.label);
  if (label === "" || Date.parse(activity.endAt) <= Date.parse(activity.startAt)) {
    return err("action/invalid-input");
  }
  if (isAhead(deps, activity.endAt)) {
    return err("retro/future");
  }
  if (hasUnknownTask(deps, activity.taskId)) {
    return err("task/unknown");
  }
  return await emit(deps, [
    stamp(
      deps,
      {
        payload: {
          activityId: newId(),
          category: activity.category,
          endAt: activity.endAt,
          label,
          startAt: activity.startAt,
          ...(activity.expectMinutes !== null &&
            activity.expectMinutes !== undefined && { expectMinutes: activity.expectMinutes }),
          ...(activity.taskId !== undefined && { taskId: activity.taskId }),
        },
        type: "activity.logged",
      },
      { at: activity.endAt },
    ),
  ]);
};

/** Corrections of a block already on the ledger: its boundaries and its name. */
const corrections = (
  deps: ActionDeps,
): Pick<EditActions, "adjustActivity" | "relabelActivity"> => ({
  adjustActivity: async (activityId, change) => {
    const activity = timeOf(deps).activities[activityId];
    if (activity === undefined) {
      return err("event/not-found");
    }
    if (isAhead(deps, change.startAt) || isAhead(deps, change.endAt)) {
      return err("retro/future");
    }
    const startAt = change.startAt ?? activity.startAt;
    const endAt = change.endAt ?? activity.endAt;
    if (endAt !== null && Date.parse(endAt) <= Date.parse(startAt)) {
      return err("action/invalid-input");
    }
    return await emit(deps, [
      stamp(deps, { payload: { activityId, ...change }, type: "activity.adjusted" }),
    ]);
  },
  relabelActivity: async (activityId, change) => {
    if (timeOf(deps).activities[activityId] === undefined) {
      return err("event/not-found");
    }
    if (hasUnknownTask(deps, change.taskId)) {
      return err("task/unknown");
    }
    return await emit(deps, [
      stamp(deps, { payload: { activityId, ...change }, type: "activity.labelled" }),
    ]);
  },
});

const movementError = (
  deps: ActionDeps,
  moved: ReturnType<typeof moveChange>,
  { endAt, startAt }: { readonly startAt: string; readonly endAt: null | string },
): ActionError | null => {
  if (isAhead(deps, moved.startAt) || isAhead(deps, moved.endAt)) {
    return "retro/future";
  }
  return endAt !== null && Date.parse(endAt) <= Date.parse(startAt) ? "action/invalid-input" : null;
};

/** Validate both edits before writing either event. */
const saveEdit = async (
  deps: ActionDeps,
  target: Extract<ActivityTarget, { kind: "edit" }>,
  entry: ActivityEntry,
): ActionResult => {
  const activity = timeOf(deps).activities[target.activityId];
  if (activity === undefined) {
    return err("event/not-found");
  }
  const moved = moveChange(target, entry);
  const isMoved = moved.startAt !== undefined || moved.endAt !== undefined;
  const moveError = isMoved
    ? movementError(deps, moved, {
        endAt: moved.endAt ?? activity.endAt,
        startAt: moved.startAt ?? activity.startAt,
      })
    : null;
  if (moveError !== null) {
    return err(moveError);
  }
  const isRenamed = shouldRelabel(target, entry);
  if (isRenamed && hasUnknownTask(deps, entry.taskId)) {
    return err("task/unknown");
  }
  return await emit(
    deps,
    editInputs(deps, {
      activityId: target.activityId,
      entry,
      moved: isMoved ? moved : null,
      isRenamed,
    }),
  );
};

const shouldRelabel = (
  target: Extract<ActivityTarget, { kind: "edit" }>,
  entry: ActivityEntry,
): boolean =>
  activityLabel(entry.label) !== target.label ||
  entry.category !== target.category ||
  (entry.expectMinutes !== undefined && entry.expectMinutes !== (target.expectMinutes ?? null)) ||
  (entry.taskId !== undefined && entry.taskId !== (target.taskId ?? null));

const saveActivity = async (
  deps: ActionDeps,
  target: ActivityTarget,
  entry: ActivityEntry,
): ActionResult => {
  if (target.kind === "edit") {
    return await saveEdit(deps, target, entry);
  }
  return entry.endAt === null
    ? err("action/invalid-input")
    : await logPast(deps, {
        category: entry.category,
        endAt: entry.endAt,
        label: entry.label,
        startAt: entry.startAt,
        ...(entry.expectMinutes !== null &&
          entry.expectMinutes !== undefined && { expectMinutes: entry.expectMinutes }),
        ...(entry.taskId !== null && entry.taskId !== undefined && { taskId: entry.taskId }),
      });
};

/** The start or the log entry that made the activity, if it still stands. */
const originOf = (deps: ActionDeps, activityId: string): Event | undefined =>
  deps.state.store
    .getState()
    .events.find(
      (event) =>
        (event.type === "activity.started" || event.type === "activity.logged") &&
        event.payload.activityId === activityId,
    );

/**
The main activity a main start closed: nothing else ended it (a start emits no stop for the
one before), so revoking the start alone would bring it back running.
*/
const closedBy = (deps: ActionDeps, origin: Event): null | string => {
  if (origin.type !== "activity.started" || origin.payload.alongside === true) {
    return null;
  }
  const { events, time } = deps.state.store.getState();
  const stopped = new Set<string>();
  for (const event of events) {
    if (event.type === "activity.stopped") {
      stopped.add(event.payload.activityId);
    }
  }
  return (
    Object.values(time.activities).find(
      (activity) =>
        activity.id !== origin.payload.activityId &&
        !activity.isLogged &&
        !activity.isAlongside &&
        activity.endAt === origin.occurredAt &&
        !stopped.has(activity.id),
    )?.id ?? null
  );
};

/** Takes a block off the ledger; the one its start had ended stays ended where it was. */
const deleteActivity = async (deps: ActionDeps, activityId: string): ActionResult => {
  const origin = originOf(deps, activityId);
  if (origin === undefined) {
    return err("event/not-found");
  }
  const before = closedBy(deps, origin);
  const kept =
    before === null
      ? ok([])
      : await emit(deps, [
          stamp(
            deps,
            { payload: { activityId: before }, type: "activity.stopped" },
            { at: origin.occurredAt, precision: origin.precision },
          ),
        ]);
  if (!kept.ok) {
    return kept;
  }
  const revoked = fromStore(await deps.state.revoke(origin.id));
  return revoked.ok ? ok([...kept.value, ...revoked.value]) : revoked;
};

export const editActions = (deps: ActionDeps): EditActions => ({
  ...corrections(deps),
  deleteActivity: async (activityId) => await deleteActivity(deps, activityId),
  logPast: async (activity) => await logPast(deps, activity),
  saveActivity: async (target, entry) => await saveActivity(deps, target, entry),
  stillGoing: async (activityId) =>
    timeOf(deps).activities[activityId] === undefined
      ? err("event/not-found")
      : await emit(deps, [
          stamp(deps, {
            payload: { activityId, stillAt: deps.clock.now() },
            type: "activity.labelled",
          }),
        ]),
});

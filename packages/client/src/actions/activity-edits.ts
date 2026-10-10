import { type ActivityCategory, err, type Event, newId, ok } from "@pace/core";

import { type ActionDeps, type ActionResult, emit, fromStore, stamp } from "./deps.ts";

/** What the Day sheet edits: an existing block (move and rename) or a new past one. */
export type ActivityTarget =
  | {
      readonly kind: "edit";
      readonly activityId: string;
      readonly label: string;
      readonly category: ActivityCategory;
      readonly startAt: string;
      /** `null` while it runs: only the start can move. */
      readonly endAt: null | string;
    }
  | { readonly kind: "log"; readonly startAt: string; readonly endAt: string };

/** The sheet's fields once read: the end is `null` for a block still running. */
export type ActivityEntry = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly startAt: string;
  readonly endAt: null | string;
};

export type PastActivity = {
  readonly label: string;
  readonly category: ActivityCategory;
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

const logPast = async (deps: ActionDeps, activity: PastActivity): ActionResult => {
  const label = activity.label.trim();
  if (label === "" || Date.parse(activity.endAt) <= Date.parse(activity.startAt)) {
    return err("action/invalid-input");
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
    const startAt = change.startAt ?? activity.startAt;
    const endAt = change.endAt ?? activity.endAt;
    if (endAt !== null && Date.parse(endAt) <= Date.parse(startAt)) {
      return err("action/invalid-input");
    }
    return await emit(deps, [
      stamp(deps, { payload: { activityId, ...change }, type: "activity.adjusted" }),
    ]);
  },
  relabelActivity: async (activityId, change) =>
    timeOf(deps).activities[activityId] === undefined
      ? err("event/not-found")
      : await emit(deps, [
          stamp(deps, { payload: { activityId, ...change }, type: "activity.labelled" }),
        ]),
});

/** Moves the block if its boundaries changed, then renames it if its name or category did. */
const saveEdit = async (
  deps: ActionDeps,
  target: Extract<ActivityTarget, { kind: "edit" }>,
  entry: ActivityEntry,
): ActionResult => {
  const edits = corrections(deps);
  const isMoved =
    entry.startAt !== target.startAt || (entry.endAt !== null && entry.endAt !== target.endAt);
  const moved = isMoved
    ? await edits.adjustActivity(target.activityId, {
        startAt: entry.startAt,
        ...(entry.endAt !== null && target.endAt !== null && { endAt: entry.endAt }),
      })
    : ok([]);
  if (!moved.ok) {
    return moved;
  }
  const isRenamed = entry.label.trim() !== target.label || entry.category !== target.category;
  const renamed = isRenamed
    ? await edits.relabelActivity(target.activityId, {
        category: entry.category,
        label: entry.label.trim(),
      })
    : ok([]);
  return renamed.ok ? ok([...moved.value, ...renamed.value]) : renamed;
};

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

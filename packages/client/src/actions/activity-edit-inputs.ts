import { activityLabel, type EventInput } from "@pace/core";

import type { ActivityEntry, ActivityTarget } from "./activity-edit-types.ts";

import { type ActionDeps, stamp } from "./deps.ts";

type EditTarget = Extract<ActivityTarget, { kind: "edit" }>;

/** The minute an instant falls in: what the sheet shows of a time, and all it reads back. */
const minuteOf = (atIso: string): number => Math.floor(Date.parse(atIso) / 60_000);

/** A typed time differs from the shown one: an instant with seconds reads back floored. */
const isRetyped = (typed: string, shown: string): boolean => minuteOf(typed) !== minuteOf(shown);

/**
The boundaries the sheet changed, and only those: an edit that carries a value it did not change
reads on the server as the person setting it (automatic sleep then never moves that end). A time
is compared at the minute the sheet shows, since automatic sleep's carry seconds the sheet cannot.
A running block's end is not the sheet's to set. Empty when neither moved.
*/
export const moveChange = (
  target: EditTarget,
  entry: ActivityEntry,
): { readonly startAt?: string; readonly endAt?: string } => ({
  ...(isRetyped(entry.startAt, target.startAt) && { startAt: entry.startAt }),
  ...(entry.endAt !== null &&
    target.endAt !== null &&
    isRetyped(entry.endAt, target.endAt) && { endAt: entry.endAt }),
});

/**
The name fields the sheet changed, and only those. The label is compared with the one the sheet
showed, which for automatic sleep is the stored "Sleep" worded in the reader's language: sent
back unchanged it would become the person's own text («Сон» for every reader, class 42).
*/
export const labelChange = (
  target: EditTarget,
  entry: ActivityEntry,
): Partial<Pick<ActivityEntry, "category" | "expectMinutes" | "label" | "taskId">> => ({
  ...(entry.category !== target.category && { category: entry.category }),
  ...(activityLabel(entry.label) !== target.label && { label: activityLabel(entry.label) }),
  ...(entry.expectMinutes !== undefined &&
    entry.expectMinutes !== (target.expectMinutes ?? null) && {
      expectMinutes: entry.expectMinutes,
    }),
  ...(entry.taskId !== undefined &&
    entry.taskId !== (target.taskId ?? null) && { taskId: entry.taskId }),
});

type EditInputs = {
  readonly activityId: string;
  readonly moved: null | ReturnType<typeof moveChange>;
  /** The name fields that changed; `null` when none did. */
  readonly relabel: null | ReturnType<typeof labelChange>;
};

/** Both inputs are assembled before the caller dispatches either one. */
export const editInputs = (
  deps: ActionDeps,
  { activityId, moved, relabel }: EditInputs,
): readonly EventInput[] => [
  ...(moved === null
    ? []
    : [stamp(deps, { payload: { activityId, ...moved }, type: "activity.adjusted" })]),
  ...(relabel === null
    ? []
    : [stamp(deps, { payload: { activityId, ...relabel }, type: "activity.labelled" })]),
];

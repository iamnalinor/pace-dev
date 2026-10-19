import { activityLabel, type EventInput } from "@pace/core";

import type { ActivityEntry, ActivityTarget } from "./activity-edit-types.ts";

import { type ActionDeps, stamp } from "./deps.ts";

export const moveChange = (
  target: Extract<ActivityTarget, { kind: "edit" }>,
  entry: ActivityEntry,
): { readonly startAt: string; readonly endAt?: string } => ({
  startAt: entry.startAt,
  ...(entry.endAt !== null && target.endAt !== null && { endAt: entry.endAt }),
});

const labelChange = (entry: ActivityEntry) => ({
  category: entry.category,
  label: activityLabel(entry.label),
  ...(entry.expectMinutes !== undefined && { expectMinutes: entry.expectMinutes }),
  ...(entry.taskId !== undefined && { taskId: entry.taskId }),
});

type EditInputs = {
  readonly activityId: string;
  readonly entry: ActivityEntry;
  readonly moved: null | ReturnType<typeof moveChange>;
  readonly isRenamed: boolean;
};

/** Both inputs are assembled before the caller dispatches either one. */
export const editInputs = (
  deps: ActionDeps,
  { activityId, entry, moved, isRenamed }: EditInputs,
): readonly EventInput[] => [
  ...(moved === null
    ? []
    : [stamp(deps, { payload: { activityId, ...moved }, type: "activity.adjusted" })]),
  ...(isRenamed
    ? [stamp(deps, { payload: { activityId, ...labelChange(entry) }, type: "activity.labelled" })]
    : []),
];

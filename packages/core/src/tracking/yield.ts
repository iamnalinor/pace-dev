import type { EventBody } from "../input/bodies.ts";
import type { Activity, TimeState } from "./model.ts";

/** A block of the main line a new past block takes time from: in part (cut, split) or whole. */
export type Yield = { readonly activity: Activity; readonly isWhole: boolean };

type Span = { readonly startAt: string; readonly endAt: string };

/**
The main-line blocks a new past block (`span`) shares time with, by start: each gives that time up
«как в календаре» (`requirements.md`; owner, 2026-11-10, R27-05), whether it was recorded live or
logged by hand. Touching is not sharing; a block run alongside gives nothing up. A running block
ends at `now`.
*/
export const yieldsTo = (time: TimeState, span: Span, now: string): readonly Yield[] => {
  const start = Date.parse(span.startAt);
  const end = Date.parse(span.endAt);
  return Object.values(time.activities)
    .filter((activity) => !activity.isAlongside)
    .map((activity) => ({
      activity,
      otherEnd: Date.parse(activity.endAt ?? now),
      otherStart: Date.parse(activity.startAt),
    }))
    .filter(({ otherEnd, otherStart }) => otherStart < end && otherEnd > start)
    .toSorted((a, b) => a.otherStart - b.otherStart)
    .map(({ activity, otherEnd, otherStart }) => ({
      activity,
      isWhole: otherStart >= start && otherEnd <= end,
    }));
};

type YieldEvent = Extract<
  EventBody,
  { readonly type: "activity.adjusted" | "activity.logged" | "event.revoked" }
>;

/** The part of a logged block after the new one, as its own logged block (a copy of it). */
const remainder = (
  activity: Activity,
  span: Span,
  { endAt, id }: { readonly endAt: string; readonly id: string },
): YieldEvent => ({
  payload: {
    activityId: id,
    category: activity.category,
    endAt,
    label: activity.label,
    startAt: span.endAt,
    ...(activity.expectMinutes !== null && { expectMinutes: activity.expectMinutes }),
    ...(activity.taskId !== null && { taskId: activity.taskId }),
  },
  type: "activity.logged",
});

/** What one logged neighbour's cut writes. */
const cutOf = (activity: Activity, span: Span, newId: () => string): readonly YieldEvent[] => {
  const endAt = activity.endAt ?? span.endAt;
  const isBefore = Date.parse(activity.startAt) < Date.parse(span.startAt);
  const isAfter = Date.parse(endAt) > Date.parse(span.endAt);
  const activityId = activity.id;
  if (isBefore && isAfter) {
    return [
      { payload: { activityId, endAt: span.startAt }, type: "activity.adjusted" },
      remainder(activity, span, { endAt, id: newId() }),
    ];
  }
  return [
    isBefore
      ? { payload: { activityId, endAt: span.startAt }, type: "activity.adjusted" }
      : { payload: { activityId, startAt: span.endAt }, type: "activity.adjusted" },
  ];
};

/**
The events that carry the cut into the logged blocks a new past block lands on, to be written in
one batch with it (one Undo takes all of it back): a block it covers whole is revoked, one it
starts or ends inside is moved back to its edge, and one it lies inside is split, the part after
it logged as a copy. A live block keeps its events: the timeline takes a logged block's time out
of the live time it covers.
*/
export const yieldEvents = (
  yields: readonly Yield[],
  span: Span,
  newId: () => string,
): readonly YieldEvent[] =>
  yields
    .filter((item) => item.activity.isLogged)
    .flatMap(({ activity, isWhole }) =>
      isWhole
        ? { payload: { targetId: activity.originEventId }, type: "event.revoked" as const }
        : cutOf(activity, span, newId),
    );

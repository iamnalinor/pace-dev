import {
  type ActivityOverrunPayload,
  calendarAttend,
  type CoreState,
  type EventInput,
  type EventStartPayload,
  newId,
  type PoolNotification,
  type Resolution,
  runningActivity,
} from "@pace/core";

const at = (
  occurredAt: string,
  body: Omit<EventInput, "occurredAt" | "precision" | "source">,
): EventInput => ({ ...body, occurredAt, precision: "exact", source: "system" }) as EventInput;

type AnswerContext = { readonly state: CoreState; readonly now: string };

/** Attend: the event tracked the way Now's offer does (`calendarAttend`: label and Expect fitted). */
const attendInputs = (
  { end, start, title }: EventStartPayload,
  { now, state }: AnswerContext,
): readonly EventInput[] => {
  const write = calendarAttend(
    state.time,
    { endAt: end, startAt: start, title },
    { activityId: newId(), now },
  );
  return [at(write.occurredAt, write.body)];
};

/** "Yes, still" moves the next ask on; Stop stops it; nothing once the activity is not running. */
const overrunInputs = (
  { activityId }: ActivityOverrunPayload,
  resolution: Resolution,
  { now, state }: AnswerContext,
): readonly EventInput[] => {
  if (runningActivity(state.time, now)?.id !== activityId) {
    return [];
  }
  if (resolution === "still") {
    return [at(now, { payload: { activityId, stillAt: now }, type: "activity.labelled" })];
  }
  return resolution === "stopped"
    ? [at(now, { payload: { activityId }, type: "activity.stopped" })]
    : [];
};

/**
The events an answer writes: Attend tracks the event, "Yes, still" and Stop act on the activity.
Skip and Read write nothing.
*/
export const answerInputs = (
  notification: PoolNotification,
  resolution: Resolution,
  context: AnswerContext,
): readonly EventInput[] => {
  if (notification.kind === "event_start") {
    return resolution === "attended" ? attendInputs(notification.payload, context) : [];
  }
  return notification.kind === "activity_overrun"
    ? overrunInputs(notification.payload, resolution, context)
    : [];
};

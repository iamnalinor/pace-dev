import {
  type ActivityOverrunPayload,
  calendarAttend,
  canResolveAs,
  type CoreState,
  type EventInput,
  type EventStartPayload,
  isOwnSignIn,
  newId,
  type PoolNotification,
  type Resolution,
  runningActivity,
} from "@pace/core";

import { d1 } from "../shared/db/d1.ts";
import { deleteSession } from "../shared/session-rows.ts";
import { endLiveSessions } from "./live-sessions.ts";

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

/**
What an answer does outside the store's log: "Not me" ends the sign-in's session, through the
same revoke Settings uses (one already ended, in Settings or by logging out there, is fine). Run
before the notification is resolved, so a failure leaves it open to be pressed again.
*/
export const applyAnswer = async (
  notification: PoolNotification,
  resolution: Resolution,
  store: { readonly env: { readonly DB: D1Database }; readonly ctx: DurableObjectState },
): Promise<void> => {
  // The store is named after its user (`idFromName(userId)`).
  const userId = store.ctx.id.name;
  if (resolution !== "revoked" || userId === undefined || notification.kind !== "login") {
    return;
  }
  const live = {
    endLiveSessions: (sessionId: string): void => {
      endLiveSessions(store.ctx, sessionId);
    },
  };
  await deleteSession(
    d1(store.env.DB),
    { sessionId: notification.payload.sessionId, userId },
    live,
  );
};

/**
Why an answer is refused before anything is written: not an answer this kind takes, or the
session a sign-in notice reports answering that notice itself (it could otherwise put away the
one message that tells the person about it).
*/
export const answerRefusal = (
  notification: PoolNotification,
  resolution: Resolution,
  sessionId: string | undefined,
): "notification/mismatch" | "notification/own-sign-in" | undefined => {
  if (isOwnSignIn(notification, sessionId)) {
    return "notification/own-sign-in";
  }
  return canResolveAs(notification.kind, resolution) ? undefined : "notification/mismatch";
};

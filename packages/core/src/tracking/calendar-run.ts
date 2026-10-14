import type { EventBody } from "../input/bodies.ts";
import type { TimeState } from "./model.ts";

import { ACTIVITY_EXPECT_MAX, ACTIVITY_LABEL_MAX } from "../events/payloads.ts";
import { runningActivity } from "./timeline.ts";

/** A label as an activity stores it: trimmed, at most `ACTIVITY_LABEL_MAX` characters. */
export const activityLabel = (text: string): string =>
  text.trim().slice(0, ACTIVITY_LABEL_MAX).trim();

/** An Expect as an activity stores it: whole positive minutes up to a day; `null` for none. */
export const activityExpect = (minutes: null | number | undefined): null | number => {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return null;
  }
  const whole = Math.min(ACTIVITY_EXPECT_MAX, Math.round(minutes));
  return whole > 0 ? whole : null;
};

/**
How long before its start a calendar event can be attended: Now offers it, Day shows Attended, the
Calendar button links to it, the server holds back its "event starting" once it is attended.
Attended that early, its run begins at the tap.
*/
export const CALENDAR_LEAD_MINUTES = 15;

const LEAD_MS = CALENDAR_LEAD_MINUTES * 60_000;

/** One occurrence of a calendar event, as far as attending it goes. */
export type CalendarOccurrence = {
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
};

/**
Whether the activity is this occurrence's run: under its title (as a label stores it) and begun
inside its window, from `CALENDAR_LEAD_MINUTES` before its start until its end. The one answer to
"attended already?" for the Attend action, Now's offer, Day's row and the server's notification
pool: a run of the same title left open since an earlier occurrence, or the occurrence just
before, is not this one's.
*/
export const isCalendarRun = (
  event: CalendarOccurrence,
  activity: { readonly label: string; readonly startAt: string },
): boolean => {
  const startedAt = Date.parse(activity.startAt);
  return (
    activity.label === activityLabel(event.title) &&
    Date.parse(event.startAt) - LEAD_MS <= startedAt &&
    startedAt < Date.parse(event.endAt)
  );
};

/** How attending an event is tracked: logged as the block it was, or started from a moment. */
export type CalendarStartPlan =
  | { readonly kind: "log"; readonly startAt: string; readonly endAt: string }
  | { readonly kind: "start"; readonly startAt: string; readonly expectMinutes: null | number };

/**
Attending a calendar event at `now`, the same from Now's offer, the Calendar button, the feed,
a phone notification and the bot: one already over is logged as the block it was; otherwise it
starts at its start when that has passed (now when it is still ahead), but not before a main
activity begun since (the event takes over from it), expected to last until its end (a day at
most, as an Expect is).
*/
export const calendarStart = (
  time: TimeState,
  event: CalendarOccurrence,
  { alongside, now }: { readonly now: string; readonly alongside?: boolean | undefined },
): CalendarStartPlan => {
  if (Date.parse(event.endAt) <= Date.parse(now)) {
    return { endAt: event.endAt, kind: "log", startAt: event.startAt };
  }
  const since = alongside === true ? null : (runningActivity(time, now)?.startAt ?? null);
  const begun = Math.min(Date.parse(event.startAt), Date.parse(now));
  const startAt = new Date(
    since === null ? begun : Math.max(begun, Date.parse(since)),
  ).toISOString();
  const minutes = (Date.parse(event.endAt) - Date.parse(startAt)) / 60_000;
  return { expectMinutes: activityExpect(minutes), kind: "start", startAt };
};

/** What attending writes, and when: the event body with its `occurredAt`. */
export type AttendWrite = { readonly occurredAt: string; readonly body: EventBody };

/**
Attending an event as a writer outside the app does it (the server, for an answer in Telegram or
on a phone notification): the same plan as `calendarStart`, the title stored as a label is.
*/
export const calendarAttend = (
  time: TimeState,
  event: CalendarOccurrence,
  { activityId, now }: { readonly now: string; readonly activityId: string },
): AttendWrite => {
  const plan = calendarStart(time, event, { now });
  const label = activityLabel(event.title);
  return plan.kind === "log"
    ? {
        body: {
          payload: {
            activityId,
            category: "other",
            endAt: plan.endAt,
            label,
            startAt: plan.startAt,
          },
          type: "activity.logged",
        },
        occurredAt: plan.endAt,
      }
    : {
        body: {
          payload: {
            activityId,
            buttonId: "calendar",
            category: "other",
            label,
            ...(plan.expectMinutes !== null && { expectMinutes: plan.expectMinutes }),
          },
          type: "activity.started",
        },
        occurredAt: plan.startAt,
      };
};

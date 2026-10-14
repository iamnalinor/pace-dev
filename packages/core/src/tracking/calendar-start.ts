import type { TimeState } from "./model.ts";

import { runningActivity } from "./timeline.ts";

/** A calendar event attended: what the person saw (its title and times). */
export type CalendarOccurrence = {
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
};

/** How attending an event is tracked: logged as the block it was, or started from a moment. */
export type CalendarStartPlan =
  | { readonly kind: "log"; readonly startAt: string; readonly endAt: string }
  | { readonly kind: "start"; readonly startAt: string; readonly expectMinutes: null | number };

/**
Attending a calendar event at `now`, the same from Now's offer, the Calendar button, the feed,
a phone notification and the bot: one already over is logged as the block it was; otherwise it
starts at its start when that has passed (now when it is still ahead), but not before a main
activity begun since (the event takes over from it), expected to last until its end.
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
  const minutes = Math.round((Date.parse(event.endAt) - Date.parse(startAt)) / 60_000);
  return { expectMinutes: minutes > 0 ? minutes : null, kind: "start", startAt };
};

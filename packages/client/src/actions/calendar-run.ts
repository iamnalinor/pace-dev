/** A label is at most this long (what the events accept). */
const MAX_LABEL = 80;

/** A label as an activity stores it: trimmed, at most `MAX_LABEL` characters. */
export const activityLabel = (text: string): string => text.trim().slice(0, MAX_LABEL).trim();

/**
How long before its start a calendar event can be attended: Now offers it, Day shows Attended, the
Calendar button links to it. Attended that early, its run begins at the tap.
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
"attended already?" for the Attend action, Now's offer and Day's row: a run of the same title
left open since an earlier occurrence, or the occurrence just before, is not this one's.
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

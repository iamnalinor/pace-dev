import { type QueryContext, startOfDayIn } from "@pace/core";

/** Where a due date falls on the viewer's calendar; the UI picks the word or the weekday. */
export type DueRelative = "later" | "today" | "tomorrow";

const MS_PER_DAY = 24 * 3_600_000;

/** Calendar days from today to the day of `at`, both read in the device zone. */
export const relativeDay = (at: string, ctx: QueryContext): DueRelative => {
  const today = Date.parse(startOfDayIn(ctx.now, ctx.deviceTz));
  const day = Date.parse(startOfDayIn(at, ctx.deviceTz));
  const days = Math.round((day - today) / MS_PER_DAY);
  if (days <= 0) {
    return "today";
  }
  return days === 1 ? "tomorrow" : "later";
};

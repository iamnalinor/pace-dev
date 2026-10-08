import type { ProjectColorName } from "../design/tokens.ts";
import type { ActivityCategory } from "./model.ts";

export { ACTIVITY_CATEGORIES } from "../events/payloads.ts";

/** Where attention is the point: phone penalties and productivity charts look at these. */
export const FOCUS_CATEGORIES: ReadonlySet<ActivityCategory> = new Set(["work", "study", "task"]);

/** Each category's color in tags, buttons and charts. */
export const CATEGORY_COLORS: Readonly<Record<ActivityCategory, ProjectColorName>> = {
  work: "blue",
  study: "violet",
  task: "teal",
  food: "amber",
  commute: "slate",
  hygiene: "teal",
  rest: "green",
  chores: "slate",
  social: "pink",
  sport: "green",
  sleep: "violet",
  other: "slate",
};

export type ExpectLimit = {
  /** How long it usually takes: past it the activity is "running long" (a soft nudge). */
  readonly expectMinutes: null | number;
  /** How long it may take at most: past it the activity is over its limit (an alert). */
  readonly limitMinutes: null | number;
};

/** What a category expects when nothing more specific is known (minutes). */
export const CATEGORY_DEFAULTS: Readonly<Record<ActivityCategory, ExpectLimit>> = {
  work: { expectMinutes: null, limitMinutes: null },
  study: { expectMinutes: null, limitMinutes: null },
  task: { expectMinutes: null, limitMinutes: null },
  food: { expectMinutes: 30, limitMinutes: null },
  commute: { expectMinutes: 45, limitMinutes: null },
  hygiene: { expectMinutes: null, limitMinutes: 60 },
  rest: { expectMinutes: 30, limitMinutes: null },
  chores: { expectMinutes: null, limitMinutes: null },
  social: { expectMinutes: null, limitMinutes: null },
  sport: { expectMinutes: 60, limitMinutes: null },
  sleep: { expectMinutes: 480, limitMinutes: null },
  other: { expectMinutes: null, limitMinutes: null },
};

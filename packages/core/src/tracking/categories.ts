import type { ProjectColorName } from "../design/tokens.ts";
import type { ActivityCategory } from "./model.ts";

export { ACTIVITY_CATEGORIES } from "../events/payloads.ts";

/** Where attention is the point: the productivity charts look at these. */
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

/** How long a category usually takes when nothing more specific is known (minutes). */
export const CATEGORY_EXPECT: Readonly<Record<ActivityCategory, null | number>> = {
  work: null,
  study: null,
  task: null,
  food: 30,
  commute: 45,
  hygiene: 30,
  rest: 30,
  chores: null,
  social: null,
  sport: 60,
  sleep: 480,
  other: null,
};

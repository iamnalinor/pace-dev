import type { HueName } from "../design/token-types.ts";
import type { ActivityCategory } from "./model.ts";

export { ACTIVITY_CATEGORIES } from "../events/payloads.ts";

/** Where attention is the point: the productivity charts look at these. */
export const FOCUS_CATEGORIES: ReadonlySet<ActivityCategory> = new Set(["work", "study", "task"]);

/** Each category's hue: twelve categories, twelve distinct hues (a line or dot in the `stroke`). */
export const CATEGORY_HUES: Readonly<Record<ActivityCategory, HueName>> = {
  work: "blue",
  study: "violet",
  task: "green",
  food: "orange",
  commute: "lime",
  hygiene: "cyan",
  rest: "teal",
  chores: "amber",
  social: "pink",
  sport: "red",
  sleep: "indigo",
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
/** Rest and sleep: while one of them runs, automatic sleep opens nothing (the person is resting). */
export const REST_CLASS: readonly ActivityCategory[] = ["rest", "sleep"];

export const isRestClass = (category: ActivityCategory): boolean => REST_CLASS.includes(category);

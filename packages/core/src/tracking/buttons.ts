import type { ActivityButton, TimeState } from "./model.ts";

import { ACTIVITY_CATEGORIES, CATEGORY_COLORS, CATEGORY_DEFAULTS } from "./categories.ts";

/** Work and study are too broad to start blind: their buttons ask what exactly first. */
const ASKING: ReadonlySet<ActivityButton["category"]> = new Set(["work", "study"]);

const button = (
  category: ActivityButton["category"],
  label: string,
  order: number,
): ActivityButton => ({
  shouldAskDetails: ASKING.has(category),
  category,
  color: CATEGORY_COLORS[category],
  id: `btn:${category}`,
  label,
  order,
  taskId: null,
  ...CATEGORY_DEFAULTS[category],
});

/**
The buttons a new account starts with (labels are the account's to rename). They live only in
code until the user edits the bar; the first edit writes them all as events. Work and Study ask
what exactly before they start.
*/
export const DEFAULT_BUTTONS: readonly ActivityButton[] = [
  button("work", "Work", 0),
  button("study", "Study", 1),
  button("food", "Food", 2),
  button("commute", "Commute", 3),
  button("rest", "Rest", 4),
  button("sport", "Sport", 5),
  button("chores", "Chores", 6),
];

/** Sleep is read from the phone's night, not tapped: a button for it is never shown. */
export const BUTTON_CATEGORIES = ACTIVITY_CATEGORIES.filter((category) => category !== "sleep");

/** The time bar's buttons in their order. */
export const effectiveButtons = (time: TimeState): readonly ActivityButton[] =>
  (time.hasCustomButtons ? Object.values(time.buttons) : DEFAULT_BUTTONS)
    .filter((candidate) => candidate.category !== "sleep")
    .toSorted((a, b) => (a.order === b.order ? a.label.localeCompare(b.label) : a.order - b.order));

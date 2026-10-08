import type { ActivityButton, TimeState } from "./model.ts";

import { CATEGORY_COLORS, CATEGORY_DEFAULTS } from "./categories.ts";

const button = (
  category: ActivityButton["category"],
  label: string,
  order: number,
): ActivityButton => ({
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
code until the user edits the bar; the first edit writes them all as events.
*/
export const DEFAULT_BUTTONS: readonly ActivityButton[] = [
  button("work", "Work", 0),
  button("study", "Study", 1),
  button("food", "Food", 2),
  button("commute", "Commute", 3),
  button("rest", "Rest", 4),
  button("sport", "Sport", 5),
  button("chores", "Chores", 6),
  button("sleep", "Sleep", 7),
];

/** The time bar's buttons in their order. */
export const effectiveButtons = (time: TimeState): readonly ActivityButton[] =>
  (time.hasCustomButtons ? Object.values(time.buttons) : DEFAULT_BUTTONS).toSorted((a, b) =>
    a.order === b.order ? a.label.localeCompare(b.label) : a.order - b.order,
  );

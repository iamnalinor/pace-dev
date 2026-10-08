import type { ActivityButton, TimeState } from "./model.ts";

import { CATEGORY_COLORS, CATEGORY_DEFAULTS } from "./categories.ts";

const button = (
  id: string,
  label: string,
  category: ActivityButton["category"],
  order: number,
): ActivityButton => ({
  category,
  color: CATEGORY_COLORS[category],
  id,
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
  button("btn:work", "Work", "work", 0),
  button("btn:study", "Study", "study", 1),
  button("btn:food", "Food", "food", 2),
  button("btn:commute", "Commute", "commute", 3),
  button("btn:rest", "Rest", "rest", 4),
  button("btn:sport", "Sport", "sport", 5),
  button("btn:chores", "Chores", "chores", 6),
  button("btn:sleep", "Sleep", "sleep", 7),
];

/** The time bar's buttons in their order. */
export const effectiveButtons = (time: TimeState): readonly ActivityButton[] =>
  (time.hasCustomButtons ? Object.values(time.buttons) : DEFAULT_BUTTONS).toSorted(
    (a, b) => a.order - b.order || a.label.localeCompare(b.label),
  );

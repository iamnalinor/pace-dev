/**
Every sheet of the app, by name: `Sheet` takes one of these, and `e2e/sheet-focus.e2e.ts` opens
each of them (it reads this list) to check where the keyboard lands. A new sheet gets a name here
and an opener there, so an app-wide rule about sheets reaches it without anyone remembering to
(bug-lessons class 90). `sheet-names.test.ts` keeps the list and the sources the same.
*/
export const SHEET_NAMES = [
  "activity",
  "add-computer",
  "change-server",
  "close",
  "connect-ai",
  "day-picker",
  "history-undo",
  "inbox-detail",
  "move-to-project",
  "task-edit",
  "task-menu",
  "time-choices",
  "week-pick",
] as const;

export type SheetName = (typeof SHEET_NAMES)[number];

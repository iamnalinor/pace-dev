import type { MessageKey } from "../i18n/i18n.ts";
import type { ActivityCategory } from "./model.ts";

/** One thing a button can start: its name (none: the button's own), category and Expect. */
export type ButtonChoice = {
  readonly id: string;
  readonly labelKey: MessageKey | null;
  readonly category: ActivityCategory;
  readonly expectMinutes: number;
};

/**
A button of the time bar. "calendar" starts whatever the calendar says is on now; a button with
one choice starts it on a tap; with more, a tap opens a picker.
*/
export type TimeButton = {
  readonly id: "calendar" | "chores" | "rest" | "sport";
  readonly kind: "calendar" | "choices";
  readonly labelKey: MessageKey;
  readonly category: ActivityCategory;
  readonly choices: readonly ButtonChoice[];
};

const sport = (expectMinutes: number): ButtonChoice => ({
  category: "sport",
  expectMinutes,
  id: `sport:${String(expectMinutes)}`,
  labelKey: null,
});

/** A chore of the picker: the key of its name is spelled out so the catalog check sees it. */
const chore = (
  labelKey: Extract<MessageKey, `time.choice.${string}`>,
  { category, expectMinutes }: Pick<ButtonChoice, "category" | "expectMinutes">,
): ButtonChoice => ({
  category,
  expectMinutes,
  id: `chores:${labelKey.slice("time.choice.".length)}`,
  labelKey,
});

/**
The four buttons, always in these places (work and study are tracked through tasks' Focus).
The chores are everyday upkeep, each with its usual length.
*/
const BUTTONS: { readonly [Id in TimeButton["id"]]: TimeButton & { readonly id: Id } } = {
  calendar: {
    category: "other",
    choices: [],
    id: "calendar",
    kind: "calendar",
    labelKey: "time.button.calendar",
  },
  rest: {
    category: "rest",
    choices: [{ category: "rest", expectMinutes: 30, id: "rest", labelKey: null }],
    id: "rest",
    kind: "choices",
    labelKey: "time.button.rest",
  },
  sport: {
    category: "sport",
    choices: [sport(30), sport(60), sport(120), sport(180)],
    id: "sport",
    kind: "choices",
    labelKey: "time.button.sport",
  },
  chores: {
    category: "chores",
    choices: [
      chore("time.choice.ready", { category: "hygiene", expectMinutes: 30 }),
      chore("time.choice.eating", { category: "food", expectMinutes: 30 }),
      chore("time.choice.cooking", { category: "chores", expectMinutes: 45 }),
      chore("time.choice.commute", { category: "commute", expectMinutes: 45 }),
      chore("time.choice.shower", { category: "hygiene", expectMinutes: 15 }),
      chore("time.choice.cleaning", { category: "chores", expectMinutes: 30 }),
      chore("time.choice.laundry", { category: "chores", expectMinutes: 20 }),
      chore("time.choice.dishes", { category: "chores", expectMinutes: 15 }),
      chore("time.choice.groceries", { category: "chores", expectMinutes: 45 }),
      chore("time.choice.errands", { category: "chores", expectMinutes: 60 }),
      chore("time.choice.nap", { category: "rest", expectMinutes: 30 }),
    ],
    id: "chores",
    kind: "choices",
    labelKey: "time.button.chores",
  },
};

/** The buttons in their places. */
export const TIME_BUTTONS: readonly TimeButton[] = [
  BUTTONS.calendar,
  BUTTONS.rest,
  BUTTONS.sport,
  BUTTONS.chores,
];

/** A button by its id. */
export const timeButton = (id: TimeButton["id"]): TimeButton => BUTTONS[id];

/** The button a choice belongs to and the choice, by the choice's id ("sport:60"). */
export const choiceById = (
  choiceId: string,
): null | { readonly button: TimeButton; readonly choice: ButtonChoice } =>
  TIME_BUTTONS.flatMap((button) =>
    button.choices.filter((choice) => choice.id === choiceId).map((choice) => ({ button, choice })),
  ).at(0) ?? null;

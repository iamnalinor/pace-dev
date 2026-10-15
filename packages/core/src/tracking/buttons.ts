import type { MessageKey } from "../i18n/i18n.ts";
import type { ActivityCategory } from "./model.ts";

/** One thing a button can start: its name, category and Expect. */
export type ButtonChoice = {
  readonly id: string;
  readonly labelKey: MessageKey;
  readonly category: ActivityCategory;
  readonly expectMinutes: number;
};

/**
A button of the time bar. Every tap opens its picker: "calendar" lists today's events, "task"
the open tasks (choosing one starts Focus on it), "choices" its own list below.
*/
export type TimeButton = {
  readonly id: "calendar" | "chores" | "rest" | "task";
  readonly kind: "calendar" | "choices" | "task";
  readonly labelKey: MessageKey;
  readonly category: ActivityCategory;
  readonly choices: readonly ButtonChoice[];
};

/** A choice of a picker, "<button>:<name>": the key of its name is spelled out so the catalog check sees it. */
const choice = (
  buttonId: TimeButton["id"],
  labelKey: Extract<MessageKey, `time.choice.${string}`>,
  { category, expectMinutes }: Pick<ButtonChoice, "category" | "expectMinutes">,
): ButtonChoice => ({
  category,
  expectMinutes,
  id: `${buttonId}:${labelKey.slice("time.choice.".length)}`,
  labelKey,
});

/**
The four buttons, always in these places. The chores are everyday upkeep, each with its usual
length; Rest is a pause of some kind, from a short break to a night's sleep (a workout counts
as sport, a nap and sleep as sleep).
*/
const BUTTONS: { readonly [Id in TimeButton["id"]]: TimeButton & { readonly id: Id } } = {
  calendar: {
    category: "other",
    choices: [],
    id: "calendar",
    kind: "calendar",
    labelKey: "time.button.calendar",
  },
  task: {
    category: "task",
    choices: [],
    id: "task",
    kind: "task",
    labelKey: "time.button.task",
  },
  chores: {
    category: "chores",
    choices: [
      choice("chores", "time.choice.ready", { category: "hygiene", expectMinutes: 30 }),
      choice("chores", "time.choice.eating", { category: "food", expectMinutes: 30 }),
      choice("chores", "time.choice.cooking", { category: "chores", expectMinutes: 45 }),
      choice("chores", "time.choice.commute", { category: "commute", expectMinutes: 45 }),
      choice("chores", "time.choice.shower", { category: "hygiene", expectMinutes: 15 }),
      choice("chores", "time.choice.cleaning", { category: "chores", expectMinutes: 30 }),
      choice("chores", "time.choice.laundry", { category: "chores", expectMinutes: 20 }),
      choice("chores", "time.choice.dishes", { category: "chores", expectMinutes: 15 }),
      choice("chores", "time.choice.groceries", { category: "chores", expectMinutes: 45 }),
      choice("chores", "time.choice.errands", { category: "chores", expectMinutes: 60 }),
    ],
    id: "chores",
    kind: "choices",
    labelKey: "time.button.chores",
  },
  rest: {
    category: "rest",
    choices: [
      choice("rest", "time.choice.break", { category: "rest", expectMinutes: 15 }),
      // The id Rest had while it was a single button: logs and the assistant's callers keep it.
      {
        ...choice("rest", "time.choice.rest", { category: "rest", expectMinutes: 30 }),
        id: "rest",
      },
      choice("rest", "time.choice.walk", { category: "rest", expectMinutes: 30 }),
      choice("rest", "time.choice.workout", { category: "sport", expectMinutes: 60 }),
      choice("rest", "time.choice.nap", { category: "sleep", expectMinutes: 30 }),
      choice("rest", "time.choice.sleep", { category: "sleep", expectMinutes: 8 * 60 }),
    ],
    id: "rest",
    kind: "choices",
    labelKey: "time.button.rest",
  },
};

/** The buttons in their places. */
export const TIME_BUTTONS: readonly TimeButton[] = [
  BUTTONS.calendar,
  BUTTONS.task,
  BUTTONS.chores,
  BUTTONS.rest,
];

/** A button by its id. */
export const timeButton = (id: TimeButton["id"]): TimeButton => BUTTONS[id];

/** The button a choice belongs to and the choice, by the choice's id ("rest:walk"). */
export const choiceById = (
  choiceId: string,
): null | { readonly button: TimeButton; readonly choice: ButtonChoice } =>
  TIME_BUTTONS.flatMap((button) =>
    button.choices.filter((one) => one.id === choiceId).map((one) => ({ button, choice: one })),
  ).at(0) ?? null;

import {
  type Activity,
  type ActivityCategory,
  CATEGORY_HUES,
  type CoreState,
  type HueName,
  type Language,
  type MessageKey,
  type MessageParams,
  paceStatus,
  type PaceStatus,
  type QueryContext,
  remindAt,
  runningActivities,
  shownLabel,
  TIME_BUTTONS,
  type TimeButton,
} from "@pace/core";

import type { NowRow } from "./now.ts";

/** One thing a button starts: its name and how long it usually takes. */
export type ChoiceView = {
  readonly id: string;
  readonly labelKey: MessageKey;
  readonly expectMinutes: number;
  /** It is the main activity running now. */
  readonly isRunning: boolean;
};

export type TimeButtonView = {
  readonly id: TimeButton["id"];
  readonly kind: TimeButton["kind"];
  readonly labelKey: MessageKey;
  readonly category: ActivityCategory;
  readonly color: HueName;
  readonly choices: readonly ChoiceView[];
  /** One of its choices is the main activity running now. */
  readonly isRunning: boolean;
};

export type RunningView = {
  readonly activityId: string;
  readonly label: string;
  readonly category: ActivityCategory;
  readonly color: HueName;
  readonly taskId: null | string;
  readonly startAt: string;
  readonly minutes: number;
  readonly expectMinutes: null | number;
  /** When it asks "still doing this?" (moved on by each "yes"); `null` without an Expect. */
  readonly remindAt: null | string;
  readonly status: PaceStatus;
  /** 0..1 of the Expect used up; `null` without one. */
  readonly share: null | number;
  readonly isAlongside: boolean;
};

export type TimeBarModel = {
  readonly buttons: readonly TimeButtonView[];
  /** The main activity running now. */
  readonly running: null | RunningView;
  /** What runs alongside it. */
  readonly alongside: readonly RunningView[];
  /**
  The task in focus: the main activity's task when Focus started it (no button of its own). The
  Task button, its picker's check and the task's own Focus button all read this one answer; a
  button's choice that also names a task belongs to that button.
  */
  readonly focusedTaskId: null | string;
};

/** The task the main activity is Focus on, or null (see `TimeBarModel.focusedTaskId`). */
const focusedTaskOf = (main: Activity | null): null | string =>
  main !== null && main.buttonId === null ? main.taskId : null;

const MS_PER_MINUTE = 60_000;

const runningView = (
  active: Activity,
  { language, now }: { readonly language: Language; readonly now: string },
): RunningView => {
  const minutes = Math.max(
    0,
    Math.floor((Date.parse(now) - Date.parse(active.startAt)) / MS_PER_MINUTE),
  );
  const target = active.expectMinutes;
  return {
    activityId: active.id,
    category: active.category,
    color: CATEGORY_HUES[active.category],
    expectMinutes: active.expectMinutes,
    isAlongside: active.isAlongside,
    label: shownLabel(active, language),
    minutes,
    share: target === null ? null : Math.min(1, minutes / target),
    startAt: active.startAt,
    remindAt: remindAt(active),
    status: paceStatus(active, now),
    taskId: active.taskId,
  };
};

/**
Whether the button's own activity is the main one: the choice it started, the calendar's
event, or for Task the time on a task that Focus started (no button of its own).
*/
const isButtonRunning = (
  button: TimeButton,
  main: Activity | null,
  choices: readonly ChoiceView[],
): boolean => {
  if (main === null) {
    return false;
  }
  return button.kind === "task"
    ? focusedTaskOf(main) !== null
    : main.buttonId === button.id || choices.some((choice) => choice.isRunning);
};

/**
The time bar at the bottom of Day: the four buttons, always in their places, and what is
running (the main activity and whatever runs alongside it).
*/
export const timeBarModel = (
  state: Pick<CoreState, "settings" | "time">,
  ctx: QueryContext,
): TimeBarModel => {
  const running = runningActivities(state.time, ctx.now);
  const shown = { language: state.settings.language, now: ctx.now };
  const main = running.find((activity) => !activity.isAlongside) ?? null;
  const mainButton = main?.buttonId ?? null;
  return {
    alongside: running
      .filter((activity) => activity.isAlongside)
      .map((activity) => runningView(activity, shown)),
    buttons: TIME_BUTTONS.map((button) => {
      const choices = button.choices.map((choice) => ({
        expectMinutes: choice.expectMinutes,
        id: choice.id,
        isRunning: choice.id === mainButton,
        labelKey: choice.labelKey,
      }));
      return {
        category: button.category,
        choices,
        color: CATEGORY_HUES[button.category],
        id: button.id,
        isRunning: isButtonRunning(button, main, choices),
        kind: button.kind,
        labelKey: button.labelKey,
      };
    }),
    focusedTaskId: focusedTaskOf(main),
    running: main === null ? null : runningView(main, shown),
  };
};

/** A title or a query as compared: lower case, ё read as е. */
const searchable = (text: string): string => text.toLocaleLowerCase().replaceAll("ё", "е");

/**
The Task button's picker: Now's open tasks in Now's order (those that start later last),
narrowed to the titles that hold every word typed, in any case and order.
*/
export const taskChoices = <Row extends Pick<NowRow, "id" | "title">>(
  board: { readonly rows: readonly Row[]; readonly future: readonly Row[] },
  query: string,
): readonly Row[] => {
  const words = searchable(query)
    .split(/\s+/u)
    .filter((word) => word !== "");
  return [...board.rows, ...board.future].filter((row) => {
    const title = searchable(row.title);
    return words.every((word) => title.includes(word));
  });
};

/** A message in the account language, still to be translated by the UI. */
export type MessageText = { readonly key: MessageKey; readonly params?: MessageParams };

/** What the running row says about its pace; nothing while it is within twice its Expect. */
export const PACE_STATUS_TEXT: Readonly<Record<PaceStatus, MessageKey | null>> = {
  long: "time.long",
  none: null,
  ok: null,
};

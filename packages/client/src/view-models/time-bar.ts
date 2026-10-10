import {
  type Activity,
  type ActivityCategory,
  CATEGORY_COLORS,
  type CoreState,
  type MessageKey,
  type MessageParams,
  paceStatus,
  type PaceStatus,
  type ProjectColorName,
  type QueryContext,
  remindAt,
  runningActivities,
  TIME_BUTTONS,
  type TimeButton,
} from "@pace/core";

/** One thing a button starts: its name (none: the button's own) and how long it usually takes. */
export type ChoiceView = {
  readonly id: string;
  readonly labelKey: MessageKey | null;
  readonly expectMinutes: number;
  /** It is the main activity running now. */
  readonly isRunning: boolean;
};

export type TimeButtonView = {
  readonly id: TimeButton["id"];
  readonly kind: TimeButton["kind"];
  readonly labelKey: MessageKey;
  readonly category: ActivityCategory;
  readonly color: ProjectColorName;
  readonly choices: readonly ChoiceView[];
  /** One of its choices is the main activity running now. */
  readonly isRunning: boolean;
};

export type RunningView = {
  readonly activityId: string;
  readonly label: string;
  readonly category: ActivityCategory;
  readonly color: ProjectColorName;
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
};

const MS_PER_MINUTE = 60_000;

const runningView = (active: Activity, now: string): RunningView => {
  const minutes = Math.max(
    0,
    Math.floor((Date.parse(now) - Date.parse(active.startAt)) / MS_PER_MINUTE),
  );
  const target = active.expectMinutes;
  return {
    activityId: active.id,
    category: active.category,
    color: CATEGORY_COLORS[active.category],
    expectMinutes: active.expectMinutes,
    isAlongside: active.isAlongside,
    label: active.label,
    minutes,
    share: target === null ? null : Math.min(1, minutes / target),
    startAt: active.startAt,
    remindAt: remindAt(active),
    status: paceStatus(active, now),
    taskId: active.taskId,
  };
};

/**
The time bar at the bottom of Now: the four buttons, always in their places, and what is running
(the main activity and whatever runs alongside it).
*/
export const timeBarModel = (state: Pick<CoreState, "time">, ctx: QueryContext): TimeBarModel => {
  const running = runningActivities(state.time, ctx.now);
  const main = running.find((activity) => !activity.isAlongside) ?? null;
  const mainButton = main?.buttonId ?? null;
  return {
    alongside: running
      .filter((activity) => activity.isAlongside)
      .map((activity) => runningView(activity, ctx.now)),
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
        color: CATEGORY_COLORS[button.category],
        id: button.id,
        isRunning: mainButton === button.id || choices.some((choice) => choice.isRunning),
        kind: button.kind,
        labelKey: button.labelKey,
      };
    }),
    running: main === null ? null : runningView(main, ctx.now),
  };
};

/** A message in the account language, still to be translated by the UI. */
export type MessageText = { readonly key: MessageKey; readonly params?: MessageParams };

/** What the running row says about its pace; nothing while it is within twice its Expect. */
export const PACE_STATUS_TEXT: Readonly<Record<PaceStatus, MessageKey | null>> = {
  long: "time.long",
  none: null,
  ok: null,
};

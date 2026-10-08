import {
  type Activity,
  type ActivityCategory,
  CATEGORY_COLORS,
  type CoreState,
  effectiveButtons,
  paceStatus,
  type PaceStatus,
  type ProjectColorName,
  type QueryContext,
  runningActivity,
} from "@pace/core";

export type TimeButtonView = {
  readonly id: string;
  readonly label: string;
  readonly category: ActivityCategory;
  readonly color: ProjectColorName;
  readonly taskId: null | string;
  readonly expectMinutes: null | number;
  readonly limitMinutes: null | number;
  /** Its activity is the one running now. */
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
  readonly limitMinutes: null | number;
  readonly status: PaceStatus;
  /** 0..1 of the Expect (else the Limit) used up; `null` without either. */
  readonly share: null | number;
};

export type TimeBarModel = {
  readonly buttons: readonly TimeButtonView[];
  readonly running: null | RunningView;
};

const MS_PER_MINUTE = 60_000;

const runningView = (active: Activity, color: ProjectColorName, now: string): RunningView => {
  const minutes = Math.max(
    0,
    Math.floor((Date.parse(now) - Date.parse(active.startAt)) / MS_PER_MINUTE),
  );
  const target = active.expectMinutes ?? active.limitMinutes;
  return {
    activityId: active.id,
    category: active.category,
    color,
    expectMinutes: active.expectMinutes,
    label: active.label,
    limitMinutes: active.limitMinutes,
    minutes,
    share: target === null ? null : Math.min(1, minutes / target),
    startAt: active.startAt,
    status: paceStatus(minutes, active),
    taskId: active.taskId,
  };
};

/** The time bar at the bottom of Now: the buttons and what is running, against its Expect and Limit. */
export const timeBarModel = (state: Pick<CoreState, "time">, ctx: QueryContext): TimeBarModel => {
  const active = runningActivity(state.time, ctx.now);
  const buttons = effectiveButtons(state.time);
  const button = buttons.find((candidate) => candidate.id === active?.buttonId);
  const running =
    active === null
      ? null
      : runningView(active, button?.color ?? CATEGORY_COLORS[active.category], ctx.now);
  return {
    buttons: buttons.map((candidate) => ({
      category: candidate.category,
      color: candidate.color,
      expectMinutes: candidate.expectMinutes,
      id: candidate.id,
      isRunning: active !== null && active.buttonId === candidate.id,
      label: candidate.label,
      limitMinutes: candidate.limitMinutes,
      taskId: candidate.taskId,
    })),
    running,
  };
};

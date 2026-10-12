import type { ResolvedPreset } from "../model/preset.ts";
import type { Task } from "../model/task.ts";
import type { NowItem } from "../queries/now-item.ts";

import { minutesBetween } from "../time.ts";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** A task is critical when its deadline is close and the work is not. */
export type Critical = {
  readonly taskId: string;
  readonly title: string;
  readonly dueAt: string;
  readonly dueTz: null | string;
  /** Hours to the deadline. */
  readonly hoursLeft: number;
  /** 0..1 in the preset's progress mode. */
  readonly progress: number;
};

/** A task in progress without a touch for too long. */
export type Stuck = {
  readonly taskId: string;
  readonly title: string;
  /** The last event on the task. */
  readonly since: string;
  readonly days: number;
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
A task is critical when less than `criticalHours` remain to its deadline while progress is
below `criticalProgress`. The thresholds come from the task's preset.
*/
export const criticalOf = (item: NowItem, now: string): Critical | null => {
  const { criticalHours, criticalProgress } = item.preset.notify;
  const dueAt = item.task.dueAt;
  if (dueAt === null) {
    return null;
  }
  const hoursLeft = minutesBetween(now, dueAt) / MINUTES_PER_HOUR;
  if (hoursLeft <= 0 || hoursLeft > criticalHours || item.progress >= criticalProgress) {
    return null;
  }
  return {
    taskId: item.task.id,
    title: item.task.title,
    dueAt,
    dueTz: item.task.dueTz,
    hoursLeft: round1(hoursLeft),
    progress: item.progress,
  };
};

/** The instant a task's deadline rule starts to apply; `null` without an explicit due date. */
export const deadlineCrossingAt = (task: Task, preset: ResolvedPreset): null | string =>
  task.dueAt === null
    ? null
    : new Date(Date.parse(task.dueAt) - preset.notify.criticalHours * 3_600_000).toISOString();

/** An in-progress task untouched past `inProgressIdleDays`. */
export const stuckOf = (task: Task, preset: ResolvedPreset, now: string): null | Stuck => {
  if (task.status !== "in_progress") {
    return null;
  }
  const days = minutesBetween(task.lastEventAt, now) / MINUTES_PER_DAY;
  return days >= preset.notify.inProgressIdleDays
    ? { taskId: task.id, title: task.title, since: task.lastEventAt, days: Math.floor(days) }
    : null;
};

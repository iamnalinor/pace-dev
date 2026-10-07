import type { ResolvedPreset } from "../model/preset.ts";
import type { Task } from "../model/task.ts";
import type { NowItem } from "../queries/now-item.ts";

import { minutesBetween } from "../time.ts";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** Why a task is critical: its deadline is close and the work is not, or its score is too high. */
export type CriticalRule = "deadline" | "score";

export type Critical = {
  readonly rule: CriticalRule;
  readonly taskId: string;
  readonly title: string;
  readonly dueAt: null | string;
  readonly dueTz: null | string;
  /** Hours to the task's own deadline; `null` without one. */
  readonly hoursLeft: null | number;
  /** 0..1 in the preset's progress mode. */
  readonly progress: number;
  readonly score: number;
};

/** Why a task is stuck: waiting on someone too long, or in progress without a touch too long. */
export type StuckRule = "idle" | "waiting";

export type Stuck = {
  readonly rule: StuckRule;
  readonly taskId: string;
  readonly title: string;
  /** Since when: the start of the waiting spell, or the last event on the task. */
  readonly since: string;
  readonly days: number;
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
A task is critical when less than `criticalHours` remain to the deadline the user set
(never an implied horizon) while progress is below `criticalProgress`, or when its score
reaches `criticalScore`. The thresholds come from the task's preset.
*/
export const criticalOf = (item: NowItem, now: string): Critical | null => {
  const { criticalHours, criticalProgress, criticalScore } = item.preset.notify;
  const dueAt = item.task.dueAt;
  const hoursLeft = dueAt === null ? null : minutesBetween(now, dueAt) / MINUTES_PER_HOUR;
  const isDeadline =
    hoursLeft !== null &&
    hoursLeft > 0 &&
    hoursLeft <= criticalHours &&
    item.progress < criticalProgress;
  const isScore = item.score.score >= criticalScore;
  if (!isDeadline && !isScore) {
    return null;
  }
  return {
    rule: isDeadline ? "deadline" : "score",
    taskId: item.task.id,
    title: item.task.title,
    dueAt,
    dueTz: item.task.dueTz,
    hoursLeft: hoursLeft === null ? null : round1(hoursLeft),
    progress: item.progress,
    score: round1(item.score.score),
  };
};

/** The instant a task's deadline rule starts to apply; `null` without an explicit due date. */
export const deadlineCrossingAt = (task: Task, preset: ResolvedPreset): null | string =>
  task.dueAt === null
    ? null
    : new Date(Date.parse(task.dueAt) - preset.notify.criticalHours * 3_600_000).toISOString();

const stuckSince = (task: Task): null | { rule: StuckRule; since: string } => {
  if (task.status === "waiting") {
    return { rule: "waiting", since: task.statusSince };
  }
  if (task.status === "in_progress") {
    return { rule: "idle", since: task.lastEventAt };
  }
  return null;
};

/** A waiting task past `waitingDays`, or an in-progress one untouched past `inProgressIdleDays`. */
export const stuckOf = (task: Task, preset: ResolvedPreset, now: string): null | Stuck => {
  const spell = stuckSince(task);
  if (spell === null) {
    return null;
  }
  const days = minutesBetween(spell.since, now) / MINUTES_PER_DAY;
  const limit =
    spell.rule === "waiting" ? preset.notify.waitingDays : preset.notify.inProgressIdleDays;
  return days >= limit
    ? { rule: spell.rule, taskId: task.id, title: task.title, since: spell.since, days: Math.floor(days) }
    : null;
};

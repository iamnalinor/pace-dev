import type { CoreState } from "../materialize/core-state.ts";
import type { Importance, ResolvedPreset } from "../model/preset.ts";
import type { PresetError } from "../presets/resolve-preset.ts";
import type { UrgencyInput, WorkLeft } from "../urgency/input.ts";

import { progressOf, type Task, unsubmittedSubtasks } from "../model/task.ts";
import { err, ok, type Result } from "../result.ts";
import { importanceOf, isCompeting, presetOf } from "./classify.ts";
import { accountTz, type QueryContext } from "./context.ts";

const MINUTES_PER_HOUR = 60;

/** The task's own estimate, else the preset's default, in hours. */
const estimateHoursOf = (task: Task, preset: ResolvedPreset): number =>
  (task.estimateMinutes ?? preset.defaultEstimateMinutes) / MINUTES_PER_HOUR;

/**
What is left once the due date has passed: for per-problem progress, only the unsubmitted
problems count, with their share of the estimate proportional to their number. Any other
progress mode has no notion of "sent", so the whole task remains.
*/
const remainingWork = (task: Task, preset: ResolvedPreset, estimateHours: number): WorkLeft => {
  if (preset.progressMode !== "subtasks" || task.subtasks.length === 0) {
    return { progress: progressOf(task, preset.progressMode), estimateHours };
  }
  const pending = unsubmittedSubtasks(task);
  if (pending.length === 0) {
    return { progress: 1, estimateHours: 0 };
  }
  const solved = pending.filter((item) => item.solvedAt !== null).length;
  return {
    progress: solved / pending.length,
    estimateHours: (pending.length / task.subtasks.length) * estimateHours,
  };
};

/** The urgency module's view of a task: its resolved preset folded with its own fields. */
/* eslint-disable max-params -- the queries contract pins (state, task, ctx, rank) */
export const urgencyInputFor = (
  state: CoreState,
  task: Task,
  ctx: QueryContext,
  rank: UrgencyInput["rank"],
): Result<UrgencyInput, PresetError> => {
  const preset = presetOf(state, task);
  if (!preset.ok) {
    return err(preset.error);
  }
  const estimateHours = estimateHoursOf(task, preset.value);
  return ok({
    importance: importanceOf(task, preset.value),
    importanceSetAt: task.importanceSetAt,
    policy: preset.value.urgencyPolicy,
    createdAt: task.createdAt,
    startAt: task.startAt,
    dueAt: task.dueAt,
    deadline: preset.value.deadlinePolicy,
    progress: progressOf(task, preset.value.progressMode),
    remaining: remainingWork(task, preset.value, estimateHours),
    estimateHours,
    // Stage 3 measures the fact/estimate median; until then estimates are taken at face value.
    calibration: 1,
    waitingSince: task.status === "waiting" ? task.statusSince : null,
    rank,
    accountTz: accountTz(state, ctx),
  });
};
/* eslint-enable max-params -- end of the pinned signature */

type Member = {
  readonly task: Task;
  readonly importance: Importance;
};

/** Manual rank first (ascending), then the unranked by creation, then id for determinism. */
const compareMembers = (a: Member, b: Member): number => {
  if (a.task.rank !== b.task.rank) {
    if (a.task.rank === null) {
      return 1;
    }
    return b.task.rank === null ? -1 : a.task.rank - b.task.rank;
  }
  if (a.task.createdAt !== b.task.createdAt) {
    return a.task.createdAt < b.task.createdAt ? -1 : 1;
  }
  return a.task.id < b.task.id ? -1 : 1;
};

/** Every competing task with its effective importance; tasks whose preset is broken are left out. */
const memberOf = (state: CoreState, task: Task): Member | undefined => {
  const preset = presetOf(state, task);
  return preset.ok ? { task, importance: importanceOf(task, preset.value) } : undefined;
};

const members = (state: CoreState): readonly Member[] =>
  Object.values(state.tasks.byId)
    .filter((task) => isCompeting(task))
    .map((task) => memberOf(state, task))
    .filter((member): member is Member => member !== undefined);

/**
The task's 1-based position among the open tasks of its importance category and the
category's size, for the rank bonus and the "your rank in Prioritized" row. Closed tasks,
inbox items and empty instances do not compete, so they have no rank.
*/
export const rankWithinCategory = (state: CoreState, task: Task): UrgencyInput["rank"] => {
  const all = members(state);
  const self = all.find((member) => member.task.id === task.id);
  if (self === undefined) {
    return null;
  }
  const category = all
    .filter((member) => member.importance === self.importance)
    .toSorted(compareMembers);
  return {
    position: category.findIndex((member) => member.task.id === task.id) + 1,
    size: category.length,
  };
};

import type { CoreState } from "../materialize/core-state.ts";
import type { Importance, ResolvedPreset } from "../model/preset.ts";
import type { PresetError } from "../presets/resolve-preset.ts";

import { type Project, projectById } from "../model/project.ts";
import { progressOf, solvedCount, submittedCount, type Task } from "../model/task.ts";
import { presetById } from "../presets/preset-reducer.ts";
import { err, ok, type Result } from "../result.ts";
import { minutesBetween } from "../time.ts";
import { compareScores, type Ranked, type Score, scoreTask } from "../urgency/score.ts";
import { importanceOf, presetOf } from "./classify.ts";
import { accountTz, type QueryContext } from "./context.ts";
import { rankWithinCategory, urgencyInputFor } from "./urgency-input.ts";
import { windowElapsedOf } from "./window.ts";

/** One row of the Now list (and of a project's open list): the task with everything its meta line shows. */
export type NowItem = {
  readonly task: Task;
  readonly preset: ResolvedPreset;
  /** The category's name as stored (built-in ones are translated by the UI). */
  readonly presetName: string;
  readonly project: null | Project;
  readonly score: Score;
  readonly importance: Importance;
  /** Progress 0..1 in the preset's progress mode. */
  readonly progress: number;
  /** Where the pace marker sits: the share of the task's window elapsed; `null` without a due. */
  readonly paceExpected: null | number;
  readonly solved: number;
  readonly total: number;
  readonly submitted: number;
  /** The explicit due date, or the horizon the importance implies (ASAP: end of the day). */
  readonly dueAt: null | string;
  readonly dueTz: null | string;
  /** Minutes past the task's own due date; `null` while on time or without a due date. */
  readonly lateMinutes: null | number;
  readonly isLate: boolean;
};

/**
Lateness is measured against the deadline the user set, never against an implied
horizon: a Prioritized task three days on is not "late", it is only more urgent.
*/
const lateMinutesOf = (task: Task, now: string): null | number => {
  if (task.dueAt === null) {
    return null;
  }
  const minutes = minutesBetween(task.dueAt, now);
  return minutes > 0 ? minutes : null;
};

/** An explicit due keeps the zone it was set in; an implied horizon is read in the account zone. */
const dueTzOf = (task: Task, effectiveDue: null | string, zone: string): null | string => {
  if (effectiveDue === null) {
    return null;
  }
  return effectiveDue === task.dueAt ? task.dueTz : zone;
};

export const nowItem = (
  state: CoreState,
  task: Task,
  ctx: QueryContext,
): Result<NowItem, PresetError> => {
  const preset = presetOf(state, task);
  if (!preset.ok) {
    return err(preset.error);
  }
  const input = urgencyInputFor(state, task, ctx, rankWithinCategory(state, task));
  if (!input.ok) {
    return err(input.error);
  }
  const score = scoreTask(input.value, ctx.now);
  const lateMinutes = lateMinutesOf(task, ctx.now);
  return ok({
    task,
    preset: preset.value,
    presetName: presetById(state.presets, task.presetId)?.name ?? task.presetId,
    project: task.projectId === null ? null : (projectById(state.projects, task.projectId) ?? null),
    score,
    importance: importanceOf(task, preset.value),
    progress: progressOf(task, preset.value.progressMode),
    paceExpected: windowElapsedOf(task, score.effectiveDue, ctx.now),
    solved: solvedCount(task),
    total: task.subtasks.length,
    submitted: submittedCount(task),
    dueAt: score.effectiveDue,
    dueTz: dueTzOf(task, score.effectiveDue, accountTz(state, ctx)),
    lateMinutes,
    isLate: lateMinutes !== null,
  });
};

const ranked = (item: NowItem): Ranked => ({
  score: item.score,
  tieBreak: { dueAt: item.score.effectiveDue, createdAt: item.task.createdAt },
});

/** Now-list order: score descending, then the earlier due, then the older task. */
export const compareNowItems = (a: NowItem, b: NowItem): number =>
  compareScores(ranked(a), ranked(b));

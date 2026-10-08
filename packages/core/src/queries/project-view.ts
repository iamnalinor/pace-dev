import type { CoreState } from "../materialize/core-state.ts";

import { type Project, projectById } from "../model/project.ts";
import { isOpen, type Task } from "../model/task.ts";
import { type Outcome, taskOutcome } from "../outcomes/outcome.ts";
import { err, ok, type Result } from "../result.ts";
import { weeklyProjectMinutes } from "../tracking/insights.ts";
import { isEmptyInstance, presetOf } from "./classify.ts";
import { accountTz, type QueryContext } from "./context.ts";
import { compareNowItems, type NowItem, nowItem } from "./now-item.ts";

export type DoneItem = {
  readonly task: Task;
  readonly outcome: Outcome;
};

export type ProjectStats = {
  readonly open: number;
  /** Closed with `done` out of every closed task that had a deadline to meet or miss. */
  readonly onTime: { readonly done: number; readonly total: number };
  /** Closed after the deadline (`done_late`) or because it passed (`cancelled_missed`). */
  readonly late: number;
  /** Tracked on the project's tasks this week (ISO week, account zone). */
  readonly hoursThisWeek: number;
  /** The last six weeks, oldest first. */
  readonly weeklyHours: readonly number[];
};

export type ProjectView = {
  readonly project: Project;
  /** Every open task but the empty instances, hidden and waiting ones included, best score first. */
  readonly open: readonly NowItem[];
  /** Empty recurring instances awaiting an assignment, earliest due first. */
  readonly awaiting: readonly Task[];
  /** Closed tasks, newest closure first. */
  readonly done: readonly DoneItem[];
  readonly stats: ProjectStats;
};

const WEEKS_SHOWN = 6;

const DEADLINE_OUTCOMES: ReadonlySet<Outcome> = new Set(["done", "done_late", "cancelled_missed"]);
const LATE_OUTCOMES: ReadonlySet<Outcome> = new Set(["done_late", "cancelled_missed"]);

/** Earliest due first; instances always carry a due date, the id breaks the rare tie. */
const byDue = (a: Task, b: Task): number => {
  const dueA = a.dueAt ?? "";
  const dueB = b.dueAt ?? "";
  if (dueA !== dueB) {
    return dueA < dueB ? -1 : 1;
  }
  return a.id < b.id ? -1 : 1;
};

const newestFirst = (a: DoneItem, b: DoneItem): number => {
  const closedA = a.task.closed?.at ?? "";
  const closedB = b.task.closed?.at ?? "";
  if (closedA !== closedB) {
    return closedA > closedB ? -1 : 1;
  }
  return a.task.id < b.task.id ? -1 : 1;
};

/** A closed task with its derived outcome; one whose preset is broken has no outcome to show. */
const doneItem = (state: CoreState, task: Task): readonly DoneItem[] => {
  const preset = presetOf(state, task);
  const outcome = preset.ok ? taskOutcome(task, preset.value) : null;
  return outcome === null ? [] : [{ task, outcome }];
};

const MINUTES_PER_HOUR = 60;

const toHours = (minutes: number): number => Math.round((minutes / MINUTES_PER_HOUR) * 10) / 10;

const stats = (
  open: readonly NowItem[],
  done: readonly DoneItem[],
  weeklyMinutes: readonly number[],
): ProjectStats => ({
  open: open.length,
  onTime: {
    done: done.filter((entry) => entry.outcome === "done").length,
    total: done.filter((entry) => DEADLINE_OUTCOMES.has(entry.outcome)).length,
  },
  late: done.filter((entry) => LATE_OUTCOMES.has(entry.outcome)).length,
  hoursThisWeek: toHours(weeklyMinutes.at(-1) ?? 0),
  weeklyHours: weeklyMinutes.map((minutes) => toHours(minutes)),
});

/** The project page: its open, awaiting and done lists with the header figures. */
export const projectView = (
  state: CoreState,
  projectId: string,
  ctx: QueryContext,
): Result<ProjectView, "project/unknown"> => {
  const project = projectById(state.projects, projectId);
  if (project === undefined) {
    return err("project/unknown");
  }
  const tasks = Object.values(state.tasks.byId).filter((task) => task.projectId === projectId);
  const open = tasks
    .filter((task) => isOpen(task) && !isEmptyInstance(task))
    .flatMap((task) => {
      const item = nowItem(state, task, ctx);
      return item.ok ? [item.value] : [];
    })
    .toSorted(compareNowItems);
  const done = tasks
    .filter((task) => !isOpen(task))
    .flatMap((task) => doneItem(state, task))
    .toSorted(newestFirst);
  const weeklyMinutes = weeklyProjectMinutes(state, projectId, {
    now: ctx.now,
    weeks: WEEKS_SHOWN,
    zone: accountTz(state, ctx),
  });
  return ok({
    project,
    open,
    awaiting: tasks.filter((task) => isOpen(task) && isEmptyInstance(task)).toSorted(byDue),
    done,
    stats: stats(open, done, weeklyMinutes),
  });
};

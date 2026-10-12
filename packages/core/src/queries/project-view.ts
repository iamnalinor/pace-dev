import type { CoreState } from "../materialize/core-state.ts";

import { type Project, projectById } from "../model/project.ts";
import { isOpen, type Task } from "../model/task.ts";
import { type Outcome, taskOutcome } from "../outcomes/outcome.ts";
import { err, ok, type Result } from "../result.ts";
import { weeklyProjectMinutes } from "../tracking/insights.ts";
import { presetOf } from "./classify.ts";
import { accountTz, type QueryContext } from "./context.ts";
import {
  compareFutureItems,
  compareNowItems,
  hasLaterStart,
  type NowItem,
  nowItem,
} from "./now-item.ts";

/** A closed task: the same row as an open one, plus how it ended. */
export type DoneItem = {
  readonly item: NowItem;
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
  /** Open tasks that have started, in the Now order (the nearest deadline first). */
  readonly open: readonly NowItem[];
  /** Open tasks that start later, the earliest start first. */
  readonly future: readonly NowItem[];
  /** Closed tasks, the latest deadline first (undated ones by their closure, after them). */
  readonly done: readonly DoneItem[];
  readonly stats: ProjectStats;
};

const WEEKS_SHOWN = 6;

const DEADLINE_OUTCOMES: ReadonlySet<Outcome> = new Set(["done", "done_late", "cancelled_missed"]);
const LATE_OUTCOMES: ReadonlySet<Outcome> = new Set(["done_late", "cancelled_missed"]);

/** Descending by a key that sorts as text; an empty key sorts last. */
const laterFirst = (a: string, b: string): number => {
  if (a === b) {
    return 0;
  }
  return a > b ? -1 : 1;
};

/** Dated before undated; the later deadline (or, undated, the later closure) first. */
const latestFirst = (a: DoneItem, b: DoneItem): number => {
  const byDue = laterFirst(a.item.dueAt ?? "", b.item.dueAt ?? "");
  if (byDue !== 0) {
    return byDue;
  }
  const byClosure = laterFirst(a.item.task.closed?.at ?? "", b.item.task.closed?.at ?? "");
  return byClosure === 0 ? a.item.task.id.localeCompare(b.item.task.id) : byClosure;
};

/** A closed task with its derived outcome; one whose preset is broken has no outcome to show. */
const doneItem = (state: CoreState, task: Task, ctx: QueryContext): readonly DoneItem[] => {
  const preset = presetOf(state, task);
  const outcome = preset.ok ? taskOutcome(task, preset.value) : null;
  const item = nowItem(state, task, ctx);
  return outcome === null || !item.ok ? [] : [{ item: item.value, outcome }];
};

const MINUTES_PER_HOUR = 60;

const toHours = (minutes: number): number => Math.round((minutes / MINUTES_PER_HOUR) * 10) / 10;

const stats = (
  openCount: number,
  done: readonly DoneItem[],
  weeklyMinutes: readonly number[],
): ProjectStats => ({
  open: openCount,
  onTime: {
    done: done.filter((entry) => entry.outcome === "done").length,
    total: done.filter((entry) => DEADLINE_OUTCOMES.has(entry.outcome)).length,
  },
  late: done.filter((entry) => LATE_OUTCOMES.has(entry.outcome)).length,
  hoursThisWeek: toHours(weeklyMinutes.at(-1) ?? 0),
  weeklyHours: weeklyMinutes.map((minutes) => toHours(minutes)),
});

/** The project page: its open, future and done lists with the header figures. */
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
  const rows = tasks.filter(isOpen).flatMap((task) => {
    const item = nowItem(state, task, ctx);
    return item.ok ? [item.value] : [];
  });
  const open = rows.filter((item) => !hasLaterStart(item.task, ctx.now)).toSorted(compareNowItems);
  const future = rows
    .filter((item) => hasLaterStart(item.task, ctx.now))
    .toSorted(compareFutureItems);
  const done = tasks
    .filter((task) => !isOpen(task))
    .flatMap((task) => doneItem(state, task, ctx))
    .toSorted(latestFirst);
  const weeklyMinutes = weeklyProjectMinutes(state, projectId, {
    now: ctx.now,
    weeks: WEEKS_SHOWN,
    zone: accountTz(state, ctx),
  });
  return ok({
    project,
    open,
    future,
    done,
    stats: stats(rows.length, done, weeklyMinutes),
  });
};

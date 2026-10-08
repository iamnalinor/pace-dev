import { tz } from "@date-fns/tz";
import { addWeeks } from "date-fns";

import type { CoreState } from "../materialize/core-state.ts";
import type { ActivityCategory } from "./model.ts";

import { isOpen, type Task, taskById } from "../model/task.ts";
import { type Outcome, taskOutcome } from "../outcomes/outcome.ts";
import { presetOf } from "../queries/classify.ts";
import { startOfWeekIn } from "../time.ts";
import { type Range, type Segment, sumMinutes, timeline } from "./timeline.ts";

/** Before any activity can exist: the start of "all time" for per-task totals. */
const EPOCH = "2000-01-01T00:00:00.000Z";

type TimeSource = Pick<CoreState, "tasks" | "time">;

const byMinutes = <T extends { readonly minutes: number }>(rows: readonly T[]): readonly T[] =>
  rows.filter((row) => row.minutes > 0).toSorted((a, b) => b.minutes - a.minutes);

const sumBy = <K extends string>(
  segments: readonly Segment[],
  keyOf: (segment: Segment) => K,
): ReadonlyMap<K, number> =>
  new Map(
    [...Map.groupBy(segments, keyOf)].map(([key, group]) => [key, sumMinutes(group)] as const),
  );

export type CategoryRow = { readonly category: ActivityCategory; readonly minutes: number };

/** Tracked minutes per category over the range, largest first. */
export const timeByCategory = (state: TimeSource, range: Range): readonly CategoryRow[] =>
  byMinutes(
    [...sumBy(timeline(state.time, range).segments, (segment) => segment.category)].map(
      ([category, minutes]) => ({ category, minutes }),
    ),
  );

export type ProjectRow = {
  /** `null` gathers the time spent on nothing that belongs to a project. */
  readonly projectId: null | string;
  readonly minutes: number;
};

const NO_PROJECT = "";

const projectOfSegment = (state: TimeSource, segment: Segment): string => {
  const task = segment.taskId === null ? undefined : taskById(state.tasks, segment.taskId);
  return task?.projectId ?? NO_PROJECT;
};

/** Tracked minutes per project (through the task the time was spent on), largest first. */
export const timeByProject = (state: TimeSource, range: Range): readonly ProjectRow[] =>
  byMinutes(
    [
      ...sumBy(timeline(state.time, range).segments, (segment) => projectOfSegment(state, segment)),
    ].map(([projectId, minutes]) => ({
      minutes,
      projectId: projectId === NO_PROJECT ? null : projectId,
    })),
  );

/** Every minute ever spent on the task. */
export const taskTrackedMinutes = (
  state: Pick<CoreState, "time">,
  taskId: string,
  now: string,
): number =>
  sumMinutes(
    timeline(state.time, { from: EPOCH, now, to: now }).segments.filter(
      (segment) => segment.taskId === taskId,
    ),
  );

/** Minutes a project got in each of the last `weeks` ISO weeks (oldest first, this week last). */
export const weeklyProjectMinutes = (
  state: TimeSource,
  projectId: string,
  { now, weeks, zone }: { readonly now: string; readonly weeks: number; readonly zone: string },
): readonly number[] => {
  const thisWeek = startOfWeekIn(now, zone);
  return Array.from({ length: weeks }, (_, index) => {
    const from = new Date(addWeeks(thisWeek, index - weeks + 1, { in: tz(zone) })).toISOString();
    const to = new Date(addWeeks(from, 1, { in: tz(zone) })).toISOString();
    return (
      timeByProject(state, { from, now, to }).find((row) => row.projectId === projectId)?.minutes ??
      0
    );
  });
};

const DEADLINE_OUTCOMES: ReadonlySet<Outcome> = new Set(["done", "done_late", "cancelled_missed"]);

export type OnTimeRow = {
  readonly projectId: null | string;
  readonly onTime: number;
  /** Closed tasks that had a deadline to meet. */
  readonly total: number;
};

const isClosedIn = (task: Task, { from, to }: Range): boolean =>
  !isOpen(task) && task.closed !== null && task.closed.at >= from && task.closed.at < to;

/** Per project: of the tasks closed in the range that had a deadline, how many met it. */
export const onTimeByProject = (state: CoreState, range: Range): readonly OnTimeRow[] => {
  const outcomes = Object.values(state.tasks.byId)
    .filter((task) => isClosedIn(task, range))
    .map((task) => {
      const preset = presetOf(state, task);
      return {
        outcome: preset.ok ? taskOutcome(task, preset.value) : null,
        projectId: task.projectId ?? NO_PROJECT,
      };
    })
    .filter((entry) => entry.outcome !== null && DEADLINE_OUTCOMES.has(entry.outcome))
    .map((entry) => ({ isOnTime: entry.outcome === "done", projectId: entry.projectId }));
  const keys = [...new Set(outcomes.map((entry) => entry.projectId))];
  return keys
    .map((key) => {
      const rows = outcomes.filter((entry) => entry.projectId === key);
      return {
        onTime: rows.filter((entry) => entry.isOnTime).length,
        projectId: key === NO_PROJECT ? null : key,
        total: rows.length,
      };
    })
    .toSorted((a, b) => b.total - a.total);
};

export type EstimateRow = {
  readonly taskId: string;
  readonly title: string;
  readonly estimateMinutes: number;
  readonly trackedMinutes: number;
};

/** Tasks closed in the range that had an estimate and tracked time: plan against fact. */
export const estimateVsTracked = (state: CoreState, range: Range): readonly EstimateRow[] =>
  Object.values(state.tasks.byId)
    .filter((task) => isClosedIn(task, range) && task.estimateMinutes !== null)
    .map((task) => ({
      estimateMinutes: task.estimateMinutes ?? 0,
      taskId: task.id,
      title: task.title,
      trackedMinutes: taskTrackedMinutes(state, task.id, range.now),
    }))
    .filter((row) => row.trackedMinutes > 0)
    .toSorted((a, b) => b.trackedMinutes - a.trackedMinutes);

import {
  type CoreState,
  type Outcome,
  type ProjectColorName,
  type ProjectStats,
  projectView,
  type QueryContext,
  type Result,
} from "@pace/core";

import { type NowRow, nowRow } from "./now.ts";
import { type DueRelative, relativeDay } from "./relative-day.ts";

/** An empty recurring instance: nothing assigned yet, so it waits here instead of on Now. */
export type AwaitingRow = {
  readonly id: string;
  readonly title: string;
  readonly dueAt: null | string;
  readonly dueTz: null | string;
  readonly relative: DueRelative | null;
};

export type DoneRow = {
  readonly id: string;
  readonly title: string;
  readonly outcome: Outcome;
  readonly closedAt: null | string;
};

export type ProjectViewModel = {
  readonly id: string;
  readonly name: string;
  readonly color: null | ProjectColorName;
  readonly description: null | string;
  readonly stats: ProjectStats;
  /** Every open task but the empty instances, best score first. */
  readonly open: readonly NowRow[];
  readonly awaiting: readonly AwaitingRow[];
  /** Newest closure first. */
  readonly done: readonly DoneRow[];
};

export const projectViewModel = (
  state: CoreState,
  projectId: string,
  ctx: QueryContext,
): Result<ProjectViewModel, "project/unknown"> => {
  const result = projectView(state, projectId, ctx);
  if (!result.ok) {
    return result;
  }
  const { project, open, awaiting, done, stats } = result.value;
  return {
    ok: true,
    value: {
      id: project.id,
      name: project.name,
      color: project.color,
      description: project.description,
      stats,
      open: open.map((item) => nowRow(item, ctx)),
      awaiting: awaiting.map((task) => ({
        id: task.id,
        title: task.title,
        dueAt: task.dueAt,
        dueTz: task.dueTz,
        relative: task.dueAt === null ? null : relativeDay(task.dueAt, ctx),
      })),
      done: done.map((entry) => ({
        id: entry.task.id,
        title: entry.task.title,
        outcome: entry.outcome,
        closedAt: entry.task.closed?.at ?? null,
      })),
    },
  };
};

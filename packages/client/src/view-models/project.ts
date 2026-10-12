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

/** A closed task: the same row as an open one, checked, with how it ended. */
export type DoneRow = NowRow & {
  readonly outcome: Outcome;
  readonly closedAt: null | string;
};

export type ProjectViewModel = {
  readonly id: string;
  readonly name: string;
  readonly color: null | ProjectColorName;
  readonly description: null | string;
  readonly stats: ProjectStats;
  /** Open tasks that have started, the nearest deadline first (as on Now). */
  readonly open: readonly NowRow[];
  /** Open tasks that start later, under "In future". */
  readonly future: readonly NowRow[];
  /** Closed tasks, the latest deadline first. */
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
  const { project, open, future, done, stats } = result.value;
  return {
    ok: true,
    value: {
      id: project.id,
      name: project.name,
      color: project.color,
      description: project.description,
      stats,
      open: open.map((item) => nowRow(item, ctx)),
      future: future.map((item) => nowRow(item, ctx)),
      done: done.map((entry) => ({
        ...nowRow(entry.item, ctx),
        outcome: entry.outcome,
        closedAt: entry.item.task.closed?.at ?? null,
      })),
    },
  };
};

import { useCallback } from "react";

import type { NowRow } from "@pace/client";

import { usePace } from "#app/app-state.tsx";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { resolvePreset } from "@pace/core";

import { useRunAction } from "./use-run-action.ts";

export type CheckTask = {
  /** A task submitted problem by problem: the check opens its submit sheet (which, when). */
  readonly opensSheet: (row: NowRow) => boolean;
  /**
  The sheet for such a task; anything else is closed as done (History undoes it). Resolves to
  whether it went through: a refused close says why, and the row has to come back.
  */
  readonly check: (row: NowRow) => Promise<boolean>;
};

/** The row's check: close as done, or the submit sheet of a task sent problem by problem. */
export const useCheckTask = (): CheckTask => {
  const { actions, state } = usePace();
  const openTask = useOpenTask();
  const run = useRunAction();
  const opensSheet = useCallback(
    (row: NowRow): boolean => {
      const current = state.store.getState();
      const task = current.tasks.byId[row.id];
      const preset =
        task === undefined
          ? undefined
          : resolvePreset(current.presets, task.presetId, task.overrides ?? undefined);
      const hasProblems = (task?.subtasks.length ?? 0) > 0;
      return hasProblems && preset?.ok === true && preset.value.submission === "per_subtask";
    },
    [state],
  );
  const check = useCallback(
    async (row: NowRow): Promise<boolean> => {
      if (opensSheet(row)) {
        openTask(row.id, { close: true });
        return true;
      }
      return await run(actions.closeTask({ outcome: "done", taskId: row.id }));
    },
    [actions, openTask, opensSheet, run],
  );
  return { check, opensSheet };
};

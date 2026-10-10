import { useCallback } from "react";

import type { NowRow } from "@pace/client";

import { usePace } from "#app/app-state.tsx";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { resolvePreset } from "@pace/core";

import { useRunAction } from "./use-run-action.ts";

/**
The row's check: a task submitted problem by problem opens its submit sheet (which problems,
when); anything else is closed as done at once (History undoes it).
*/
export const useCheckTask = (): ((row: NowRow) => void) => {
  const { actions, state } = usePace();
  const openTask = useOpenTask();
  const run = useRunAction();
  return useCallback(
    (row: NowRow) => {
      const current = state.store.getState();
      const task = current.tasks.byId[row.id];
      const preset =
        task === undefined
          ? undefined
          : resolvePreset(current.presets, task.presetId, task.overrides ?? undefined);
      const hasProblems = (task?.subtasks.length ?? 0) > 0;
      if (hasProblems && preset?.ok === true && preset.value.submission === "per_subtask") {
        openTask(row.id, { close: true });
        return;
      }
      void run(actions.closeTask({ outcome: "done", taskId: row.id }));
    },
    [actions, openTask, run, state],
  );
};

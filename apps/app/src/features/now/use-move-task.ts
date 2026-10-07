import { useCallback } from "react";

import { usePace } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { rankWithinCategory } from "@pace/core";

/** Moves a task `steps` places inside its importance category (negative = up). */
export const useMoveTask = (): ((taskId: string, steps: number) => void) => {
  const { actions, state } = usePace();
  const run = useRunAction();
  return useCallback(
    (taskId: string, steps: number) => {
      const current = state.store.getState();
      const task = current.tasks.byId[taskId];
      const rank = task === undefined ? null : rankWithinCategory(current, task);
      if (rank === null || steps === 0) {
        return;
      }
      void run(actions.setRank(taskId, rank.position + steps));
    },
    [actions, run, state],
  );
};

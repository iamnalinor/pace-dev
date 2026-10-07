import { useRouter } from "expo-router";
import { useCallback } from "react";

import type { NowRow } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { resolvePreset } from "@pace/core";

import { useRunAction } from "./use-run-action.ts";

/**
The row's check: a task submitted problem by problem opens its submit sheet (which problems,
when); anything else is closed as done at once, with Undo in the toast.
*/
export const useCheckTask = (): ((row: NowRow) => void) => {
  const { actions, state } = usePace();
  const router = useRouter();
  const run = useRunAction();
  const t = useT();
  return useCallback(
    (row: NowRow) => {
      const current = state.store.getState();
      const task = current.tasks.byId[row.id];
      const preset =
        task === undefined
          ? undefined
          : resolvePreset(current.presets, task.presetId, task.overrides ?? undefined);
      const hasProblems = (task?.subtasks.length ?? 0) > 0;
      if (preset?.ok === true && preset.value.submission === "per_subtask" && hasProblems) {
        router.push(`/task/${row.id}?close=1`);
        return;
      }
      void run(actions.closeTask({ outcome: "done", taskId: row.id }), {
        success: t("now.doneToast", { title: row.title }),
        undo: true,
      });
    },
    [actions, router, run, state, t],
  );
};

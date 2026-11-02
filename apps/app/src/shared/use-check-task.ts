import { useCallback } from "react";

import type { NowRow } from "@pace/client";

import { usePace } from "#app/app-state.tsx";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { resolvePreset } from "@pace/core";

import { useCloseWithUndo } from "./use-close-with-undo.ts";

export type CheckTask = {
  /** A task submitted subtask by subtask: the check opens its submit sheet (which, when). */
  readonly doesOpenSheet: (row: NowRow) => boolean;
  /**
  The sheet for such a task; anything else is closed as done (History undoes it). Resolves to
  whether it went through (`ok`): a refused close says why, and the row has to come back.
  */
  readonly check: (row: NowRow) => Promise<{ readonly ok: boolean }>;
};

/** The row's check: close as done, or the submit sheet of a task sent subtask by subtask. */
export const useCheckTask = (): CheckTask => {
  const { state } = usePace();
  const openTask = useOpenTask();
  const closeWithUndo = useCloseWithUndo();
  const doesOpenSheet = useCallback(
    (row: NowRow): boolean => {
      const current = state.store.getState();
      const task = current.tasks.byId[row.id];
      const preset =
        task === undefined
          ? undefined
          : resolvePreset(current.presets, task.presetId, task.overrides ?? undefined);
      const hasSubtasks = (task?.subtasks.length ?? 0) > 0;
      return hasSubtasks && preset?.ok === true && preset.value.submission === "per_subtask";
    },
    [state],
  );
  const check = useCallback(
    async (row: NowRow): Promise<{ readonly ok: boolean }> => {
      if (doesOpenSheet(row)) {
        openTask(row.id, { close: true });
        return { ok: true };
      }
      return await closeWithUndo(row.id, row.title);
    },
    [closeWithUndo, doesOpenSheet, openTask],
  );
  return { check, doesOpenSheet };
};

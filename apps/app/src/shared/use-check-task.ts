import type { NowRow } from "@pace/client";

import { useCloseWithUndo } from "./use-close-with-undo.ts";

export type CheckTask = {
  /**
  The row's check: the task closed as done (History undoes it), whatever its preset: a subtask
  has one mark, done, so there is nothing to send first (feedback 5). Resolves to whether it went
  through (`ok`): a refused close says why, and the row has to come back.
  */
  readonly check: (row: NowRow) => Promise<{ readonly ok: boolean }>;
};

/** The row's check: close as done. */
export const useCheckTask = (): CheckTask => {
  const closeWithUndo = useCloseWithUndo();
  return { check: async (row) => await closeWithUndo(row.id, row.title) };
};

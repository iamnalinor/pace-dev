import type { TaskViewModel } from "@pace/client";

import { usePace } from "#app/app-state.tsx";
import { useCloseWithUndo } from "#app/shared/use-close-with-undo.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";

import { sendingIds } from "./close-model.ts";

/**
The footer's Done in one tap: sends the solved subtasks, or closes the task as done, now
(History undoes it). Another time or outcome is the long press on Done.
*/
export const useFinishTask = (view: TaskViewModel): (() => void) => {
  const { actions } = usePace();
  const run = useRunAction();
  const closeWithUndo = useCloseWithUndo();
  return () => {
    if (view.primaryAction.kind === "submit") {
      void run(actions.submit({ subtaskIds: sendingIds(view), taskId: view.id }));
    } else {
      void closeWithUndo(view.id, view.title);
    }
  };
};

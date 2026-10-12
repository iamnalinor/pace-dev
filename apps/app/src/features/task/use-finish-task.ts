import type { TaskViewModel } from "@pace/client";

import { usePace } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";

import { sendingIds } from "./close-model.ts";

/**
The footer's Done in one tap: sends the solved problems, or closes the task as done, now
(History undoes it). Another time or outcome is the long press on Done.
*/
export const useFinishTask = (view: TaskViewModel): (() => void) => {
  const { actions } = usePace();
  const run = useRunAction();
  return () => {
    void run(
      view.primaryAction.kind === "submit"
        ? actions.submit({ subtaskIds: sendingIds(view), taskId: view.id })
        : actions.closeTask({ outcome: "done", taskId: view.id }),
    );
  };
};

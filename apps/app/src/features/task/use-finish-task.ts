import type { TaskViewModel } from "@pace/client";

import { useCloseWithUndo } from "#app/shared/use-close-with-undo.ts";

/**
The footer's Done in one tap: closes the task as done, now (History undoes it). Another time or
outcome is the button beside Done (or its long press).
*/
export const useFinishTask = (view: TaskViewModel): (() => void) => {
  const closeWithUndo = useCloseWithUndo();
  return () => {
    void closeWithUndo(view.id, view.title);
  };
};

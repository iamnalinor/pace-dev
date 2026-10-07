import { useCallback } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { actionErrorText } from "#web/shared/lib/action-error.ts";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { queryContext, taskViewModel } from "@pace/client";

/** The query string that opens the close sheet on the task page. */
export const CLOSE_SHEET_PARAM = "close";

type Target = { readonly id: string; readonly title: string };

/**
The check circle of a task row. A per-problem task needs to know which problems went out
and when, so it opens the task's close sheet; anything else closes as done right away,
with a toast that takes it back.
*/
export const useCompleteTask = (): ((target: Target) => Promise<void>) => {
  const { actions, clock, state } = useServices();
  const t = useT();
  const navigate = useNavigate();
  const run = useRunAction();
  return useCallback(
    async ({ id, title }: Target) => {
      const view = taskViewModel(state.store.getState(), id, queryContext(clock));
      if (!view.ok) {
        toast.error(actionErrorText(t, view.error));
        return;
      }
      const isPerProblem = view.value.tags.some(
        (tag) => tag.kind === "submission" && tag.submission === "per_subtask",
      );
      if (isPerProblem) {
        await navigate(`/task/${id}?${CLOSE_SHEET_PARAM}=1`);
        return;
      }
      await run(actions.closeTask({ outcome: "done", taskId: id }), {
        undo: t("now.doneToast", { title }),
      });
    },
    [actions, clock, navigate, run, state, t],
  );
};

import { useCallback } from "react";

import type { ActionResult } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { toastQuote } from "#app/ui/toast.tsx";
import { taskById } from "@pace/core";

import { useRunAction } from "./use-run-action.ts";

/**
A one-tap Done action offers an immediate way back wherever it appears. Resolves to the close's
own result (`ok` once it went through).
*/
export const useCloseWithUndo = (): ((taskId: string, title: string) => ActionResult) => {
  const { actions } = usePace();
  const t = useT();
  const run = useRunAction();
  return useCallback(
    async (taskId, title) => {
      const result = await actions.closeTask({ outcome: "done", taskId });
      const [closed] = result.ok ? result.value : [];
      return await run(
        Promise.resolve(result),
        closed === undefined
          ? undefined
          : {
              success: t("now.doneToast", { title: toastQuote(title) }),
              action: {
                label: t("common.undo"),
                onPress: () => {
                  void run(actions.revoke(closed.id));
                },
                undoes: [closed.id],
                // Reopened another way (no revocation): the toast goes (R28-02's class).
                holds: (state) => taskById(state.tasks, taskId)?.closed?.eventId === closed.id,
              },
            },
      );
    },
    [actions, run, t],
  );
};

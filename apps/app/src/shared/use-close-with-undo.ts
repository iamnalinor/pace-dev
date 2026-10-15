import { useCallback } from "react";

import { usePace, useT } from "#app/app-state.tsx";

import { useRunAction } from "./use-run-action.ts";

/** A one-tap Done action offers an immediate way back wherever it appears. */
export const useCloseWithUndo = (): ((taskId: string, title: string) => Promise<boolean>) => {
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
              success: t("now.doneToast", { title }),
              action: {
                label: t("common.undo"),
                onPress: () => {
                  void run(actions.revoke(closed.id));
                },
              },
            },
      );
    },
    [actions, run, t],
  );
};

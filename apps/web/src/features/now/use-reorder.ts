import { useCallback } from "react";
import { toast } from "sonner";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { actionErrorText } from "#web/shared/lib/action-error.ts";
import { type NowRow, queryContext, taskViewModel } from "@pace/client";

import { reorderTarget } from "./reorder.ts";

/**
Applies a drop on the board: the task takes the manual rank of the task it landed on.
That rank counts every competing task of the category (waiting ones too), so it comes
from the target's own view, not from its place on the screen.
*/
export const useReorder = (
  rows: readonly NowRow[],
): ((activeId: string, overId: null | string) => Promise<void>) => {
  const { actions, clock, state } = useServices();
  const t = useT();
  return useCallback(
    async (activeId, overId) => {
      const target = reorderTarget(rows, activeId, overId);
      switch (target.kind) {
        case "none": {
          return;
        }
        case "other-category": {
          toast(t("now.otherCategory"));
          return;
        }
        case "move": {
          const over = taskViewModel(state.store.getState(), target.overId, queryContext(clock));
          const position = over.ok ? over.value.rank?.position : undefined;
          if (position === undefined) {
            return;
          }
          const result = await actions.setRank(target.taskId, position);
          if (!result.ok) {
            toast.error(actionErrorText(t, result.error));
          }
        }
      }
    },
    [actions, clock, rows, state, t],
  );
};

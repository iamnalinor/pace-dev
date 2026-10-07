import { useCallback } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@pace/client";
import type { Event } from "@pace/core";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";

import { actionErrorText } from "./action-error.ts";
import { revokeEvents, showUndoToast } from "./undo-toast.ts";

type Options = {
  /** Toasts this message with an Undo that revokes exactly the appended events. */
  readonly undo?: string;
};

/**
Awaits an action: a refusal becomes a translated error toast, a success optionally an
undo toast. Answers the appended events, or `null` when the action was refused.
*/
export const useRunAction = (): ((
  pending: ActionResult,
  options?: Options,
) => Promise<null | readonly Event[]>) => {
  const { actions } = useServices();
  const t = useT();
  return useCallback(
    async (pending, options = {}) => {
      const result = await pending;
      if (!result.ok) {
        toast.error(actionErrorText(t, result.error));
        return null;
      }
      const { undo } = options;
      if (undo !== undefined && result.value.length > 0) {
        showUndoToast({
          message: undo,
          onUndo: () => {
            void revokeEvents(actions.revoke, result.value);
          },
          undoLabel: t("common.undo"),
        });
      }
      return result.value;
    },
    [actions, t],
  );
};

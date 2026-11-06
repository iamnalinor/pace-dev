import type { InboxCard } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useToast } from "#app/ui/toast.tsx";

/** Accept (the capture becomes a task with its guess) and Delete (with the toast's Undo). */
export const useCaptureActions = (card: InboxCard) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const toast = useToast();
  return {
    accept: async (): Promise<boolean> => {
      const result = await run(actions.acceptSuggestion(card.id, card.suggestion));
      return result.ok;
    },
    remove: async (): Promise<boolean> => {
      const result = await run(actions.discardInbox(card.id));
      if (!result.ok) {
        return false;
      }
      const [revocation] = result.value;
      toast.show({
        message: t("inbox.deleted"),
        ...(revocation !== undefined && {
          action: {
            label: t("common.undo"),
            onPress: () => void run(actions.revoke(revocation.id)),
          },
        }),
      });
      return true;
    },
  };
};

import type { InboxCard } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { toastQuote, useToast } from "#app/ui/toast.tsx";

/**
Accept (the capture becomes a task with its guess) and Delete, each with the toast's Undo, as the
app's other actions (QA round 25 R25-06): Undo revokes what the action wrote, in one batch.
*/
export const useCaptureActions = (card: InboxCard) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const toast = useToast();
  return {
    accept: async (): Promise<boolean> => {
      const result = await run(actions.acceptSuggestion(card.id, card.suggestion));
      if (!result.ok) {
        return false;
      }
      const written = result.value.map((event) => event.id);
      toast.show({
        message: t("inbox.accepted", { title: toastQuote(card.text) }),
        action: {
          label: t("common.undo"),
          // One action, all or none: no half-sorted note on a failure, one History row (M2, R26-10).
          onPress: () => void run(actions.revokeAll(written)),
          undoes: written,
        },
      });
      return true;
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
            undoes: [revocation.id],
          },
        }),
      });
      return true;
    },
  };
};

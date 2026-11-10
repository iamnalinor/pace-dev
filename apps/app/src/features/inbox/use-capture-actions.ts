import type { InboxCard } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { toastQuote, useToast } from "#app/ui/toast.tsx";

/**
Accept (the capture becomes a task with its guess) and Delete, each with the toast's Undo, as the
app's other actions (QA round 25 R25-06): Undo revokes what the action wrote, newest first.
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
      const written = result.value.toReversed();
      toast.show({
        message: t("inbox.accepted", { title: toastQuote(card.text) }),
        action: {
          label: t("common.undo"),
          onPress: () => {
            void (async () => {
              // Each correction lands before the next, newest first.
              for (const event of written) {
                const undone = await run(actions.revoke(event.id));
                if (!undone.ok) {
                  return;
                }
              }
            })();
          },
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
          },
        }),
      });
      return true;
    },
  };
};

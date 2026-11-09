import type { usePendingActions } from "#app/shared/assistant/use-pending-actions.ts";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useToast } from "#app/ui/toast.tsx";

/**
To Inbox: the line is kept as a note and a toast says so, with Undo (spec §5.1 «Сохранено во
входящих · Вернуть»; design review M10): the note leaves the Inbox and the line comes back. A
preview of it goes, and the assistant log hears so.
*/
export const useToInbox = (
  text: string,
  pending: Pick<ReturnType<typeof usePendingActions>, "keptInInbox">,
  { done, onText }: { readonly done: () => void; readonly onText: (text: string) => void },
) => {
  const { actions } = usePace();
  const run = useRunAction();
  const toast = useToast();
  const t = useT();
  return async (): Promise<void> => {
    const capture = await run(actions.captureInbox(text));
    if (!capture.ok) {
      return;
    }
    // Where the line went, in words: only the Inbox badge moved before (QA round 14 L10).
    const [created] = capture.value;
    toast.show({
      message: t("composer.toInboxDone"),
      ...(created !== undefined && {
        action: {
          label: t("common.undo"),
          onPress: () => {
            void (async () => {
              const undone = await run(actions.revoke(created.id));
              if (undone.ok) {
                onText(text);
              }
            })();
          },
        },
      }),
    });

    pending.keptInInbox();
    done();
  };
};

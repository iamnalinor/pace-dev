import { toast } from "sonner";

import type { ComposerExtras, ComposerModel } from "@pace/client";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";

/** Enter and "To Inbox": each calls `onSaved` once the line is stored, so the composer clears. */
export const useComposerSubmit = (onSaved: () => void) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  const addTask = async (model: ComposerModel, extras: ComposerExtras): Promise<void> => {
    const message =
      model.target.kind === "instance"
        ? t("composer.addedTo", { title: model.target.title })
        : t("add.added");
    if ((await run(actions.createFromComposer(model, extras), { undo: message })) !== null) {
      onSaved();
    }
  };
  const sendToInbox = async (text: string, message = t("add.toInboxDone")): Promise<void> => {
    if (text.trim() === "") {
      toast.error(t("composer.empty"));
      return;
    }
    if ((await run(actions.captureInbox(text), { undo: message })) !== null) {
      onSaved();
    }
  };
  return { addTask, sendToInbox };
};

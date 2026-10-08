import { toast } from "sonner";

import type { AiOutcome, ComposerExtras, ComposerModel } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatTime } from "#web/shared/format/time.ts";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";

/** Enter and "To Inbox": each calls `onSaved` once the line is stored, so the composer clears. */
export const useComposerSubmit = (onSaved: () => void) => {
  const t = useT();
  const language = useLanguage();
  const { actions, hooks } = useServices();
  const { deviceTz } = hooks.useClock();
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
  /** "Read it when it's back" went through: the server has the line, so the composer clears. */
  const readLater = (outcome: AiOutcome): void => {
    if (outcome.status !== "queued") {
      return;
    }
    toast.success(
      outcome.retryAt === null
        ? t("composer.aiQueuedSoon")
        : t("composer.aiQueued", { time: formatTime(outcome.retryAt, deviceTz, language) }),
    );
    onSaved();
  };
  return { addTask, readLater, sendToInbox };
};

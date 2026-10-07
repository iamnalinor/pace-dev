import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";

import type { CloseForm } from "./use-close-form.ts";

import { sendingIds } from "./close-model.ts";

/** Records what the sheet says, closes it once that worked, and offers Undo in the toast. */
export const useSubmitClose = (
  view: TaskViewModel,
  form: CloseForm,
  onDone: () => void,
): (() => void) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  return () => {
    if (form.at === null) {
      return;
    }
    const when = {
      at: form.at,
      precision: form.isExact ? ("exact" as const) : ("approx" as const),
    };
    const taskId = view.id;
    const sending = sendingIds(view);
    const reason = form.reason.trim();
    const [result, success] =
      form.mode === "submit"
        ? [
            actions.submit({ ...when, subtaskIds: sending, taskId }),
            t("close.submittedToast", { count: sending.length, title: view.title }),
          ]
        : [
            actions.closeTask({
              ...when,
              outcome: form.mode === "other" ? form.outcome : "done",
              ...(form.mode === "other" && reason !== "" && { reason }),
              taskId,
            }),
            t("close.closedToast", {
              outcome: t(form.mode === "other" ? `close.${form.outcome}` : "outcome.done"),
              title: view.title,
            }),
          ];
    void (async () => {
      if (await run(result, { success, undo: true })) {
        onDone();
      }
    })();
  };
};

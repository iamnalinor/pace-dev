import { useLanguage, useT } from "#app/app-state.tsx";
import { joinList } from "#app/format/numbers.ts";
import { submitLabel, type TaskViewModel } from "@pace/client";

import { sendingIds, subtaskName } from "./close-model.ts";

/** "Submit 3 and 4" from the subtasks being sent. */
export const useSubmitTitle = (view: TaskViewModel): string => {
  const t = useT();
  const language = useLanguage();
  const sending = new Set(sendingIds(view));
  const names = view.subtasks
    .filter((subtask) => sending.has(subtask.id))
    .map((subtask) => subtaskName(subtask));
  return t("task.submitSubtasks", { subtasks: joinList(names, language) });
};

/** The footer's one-line label: the names of a few, the count of many (F-DAT-01). */
export const useSubmitLabel = (view: TaskViewModel): string => submitLabel(view, useLanguage());

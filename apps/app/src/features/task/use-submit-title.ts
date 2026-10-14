import type { TaskViewModel } from "@pace/client";

import { useLanguage, useT } from "#app/app-state.tsx";
import { joinList } from "#app/format/numbers.ts";

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

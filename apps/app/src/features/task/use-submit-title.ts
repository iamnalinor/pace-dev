import type { TaskViewModel } from "@pace/client";

import { useLanguage, useT } from "#app/app-state.tsx";
import { joinList } from "#app/format/numbers.ts";

import { problemName, sendingIds } from "./close-model.ts";

/** "Submit 3 and 4" from the problems being sent. */
export const useSubmitTitle = (view: TaskViewModel): string => {
  const t = useT();
  const language = useLanguage();
  const sending = new Set(sendingIds(view));
  const names = view.problems.filter((problem) => sending.has(problem.id)).map(problemName);
  return t("task.submitProblems", { problems: joinList(names, language) });
};

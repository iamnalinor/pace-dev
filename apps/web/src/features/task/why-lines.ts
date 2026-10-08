import { formatOrdinal } from "#web/shared/format/number.ts";
import { type Language, t } from "@pace/core";

/** The card's title from the task's place on the board (`-1`: not on it right now). */
export const whyTitle = (index: number, language: Language): string => {
  if (index < 0) {
    return t(language, "task.whyHere");
  }
  return index === 0
    ? t(language, "task.whyTop")
    : t(language, "task.whyNth", { nth: formatOrdinal(index + 1, language) });
};

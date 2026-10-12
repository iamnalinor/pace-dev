import { type Language, t } from "@pace/core";

/** `3, 4 and 5` / `3, 4 и 5`: problem numbers as people read them out. */
export const joinList = (items: readonly string[], language: Language): string => {
  const last = items.at(-1);
  return last === undefined || items.length === 1
    ? (last ?? "")
    : `${items.slice(0, -1).join(", ")} ${t(language, "common.and")} ${last}`;
};

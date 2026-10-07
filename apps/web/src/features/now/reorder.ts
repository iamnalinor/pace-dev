import type { NowRow } from "@pace/client";

export type ReorderTarget =
  | { readonly kind: "move"; readonly taskId: string; readonly overId: string }
  | { readonly kind: "none" }
  | { readonly kind: "other-category" };

/**
What a drop on the board means. Manual rank only orders tasks inside one importance
category, so a task can take the place of another task of the same importance only.
*/
export const reorderTarget = (
  rows: readonly NowRow[],
  activeId: string,
  overId: null | string,
): ReorderTarget => {
  const active = rows.find((row) => row.id === activeId);
  const over = rows.find((row) => row.id === overId);
  if (active === undefined || over === undefined || active.id === over.id) {
    return { kind: "none" };
  }
  return active.importance === over.importance
    ? { kind: "move", overId: over.id, taskId: active.id }
    : { kind: "other-category" };
};

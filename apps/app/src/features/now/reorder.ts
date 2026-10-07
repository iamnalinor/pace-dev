import type { NowRow } from "@pace/client";

/**
How many places a drag moves a task inside its importance category: the rows it passed on
the screen, counting only those of the same category (the others rank on their own).
*/
export const categorySteps = (rows: readonly NowRow[], id: string, rowsMoved: number): number => {
  const index = rows.findIndex((row) => row.id === id);
  const moved = rows[index];
  if (moved === undefined || rowsMoved === 0) {
    return 0;
  }
  const passed =
    rowsMoved > 0
      ? rows.slice(index + 1, index + 1 + rowsMoved)
      : rows.slice(Math.max(index + rowsMoved, 0), index);
  const steps = passed.filter((row) => row.importance === moved.importance).length;
  if (steps === 0) {
    return 0;
  }
  return rowsMoved > 0 ? steps : -steps;
};

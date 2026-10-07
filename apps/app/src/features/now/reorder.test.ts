import type { NowRow } from "@pace/client";

import { categorySteps } from "./reorder.ts";

const row = (id: string, importance: NowRow["importance"]): NowRow => ({
  color: "blue",
  dimmed: false,
  id,
  importance,
  meta: [],
  paceExpected: null,
  progress: 0,
  projectId: null,
  title: id,
});

const rows = [
  row("a", "normal"),
  row("b", "asap"),
  row("c", "normal"),
  row("d", "normal"),
  row("e", "nice_to_have"),
];

describe("categorySteps", () => {
  it("counts only the rows of the same importance the drag passed", () => {
    expect(categorySteps(rows, "a", 2)).toBe(1);
    expect(categorySteps(rows, "a", 3)).toBe(2);
    expect(categorySteps(rows, "d", -3)).toBe(-2);
    expect(categorySteps(rows, "d", -1)).toBe(-1);
    expect(categorySteps(rows, "c", -5)).toBe(-1);
  });

  it("does not move for no drag, an unknown row or a drag past the ends", () => {
    expect(categorySteps(rows, "c", 0)).toBe(0);
    expect(categorySteps(rows, "zz", 2)).toBe(0);
    expect(categorySteps(rows, "e", 4)).toBe(0);
    expect(categorySteps(rows, "a", -4)).toBe(0);
  });
});

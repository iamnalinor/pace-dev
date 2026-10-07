import { describe, expect, it } from "vitest";

import type { NowRow } from "@pace/client";

import { reorderTarget } from "./reorder.ts";

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
  row("calc", "normal"),
  row("reply", "asap"),
  row("trk", "prioritized"),
  row("hw", "normal"),
];

describe("reorderTarget", () => {
  it("moves a task onto the place of another task of its importance", () => {
    expect(reorderTarget(rows, "hw", "calc")).toEqual({
      kind: "move",
      overId: "calc",
      taskId: "hw",
    });
  });

  it("refuses to move across importance categories", () => {
    expect(reorderTarget(rows, "hw", "trk")).toEqual({ kind: "other-category" });
  });

  it("does nothing when the task lands where it was or outside the list", () => {
    expect(reorderTarget(rows, "hw", "hw")).toEqual({ kind: "none" });
    expect(reorderTarget(rows, "hw", null)).toEqual({ kind: "none" });
    expect(reorderTarget(rows, "gone", "calc")).toEqual({ kind: "none" });
  });
});

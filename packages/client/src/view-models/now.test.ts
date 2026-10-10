import { describe, expect, it } from "vitest";

import { minutesBetween } from "@pace/core";
import {
  ALGEBRA_ID,
  artboardState,
  BOOKS_ID,
  CALC_HW5_DUE,
  CALC_HW5_ID,
  CALCULUS_ID,
  ctx,
  HW_DUE,
  HW_ID,
  MOSCOW,
  REPLY_ID,
  TRK_DUE,
  TRK_ID,
  TRK_NOW,
  WORK_ID,
} from "@pace/core/testing";

import { type NowRow, nowViewModel } from "./now.ts";

const row = (rows: readonly NowRow[], id: string): NowRow => {
  const found = rows.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`${id} is not on the board`);
  }
  return found;
};

describe("nowViewModel", () => {
  const board = nowViewModel(artboardState(), ctx());

  it("lists the rows by deadline, with the inbox counter and the In future fold", () => {
    expect(board.rows.map((entry) => entry.id).slice(0, 2)).toEqual([CALC_HW5_ID, HW_ID]);
    expect(board.rows.map((entry) => entry.id).at(-1)).toBe(REPLY_ID);
    expect(board.inboxCount).toBe(3);
    expect(board.future).toHaveLength(4);
    expect(board.future[0]?.meta).toContainEqual(expect.objectContaining({ kind: "starts" }));
  });

  it("describes Algebra HW 6 as due tomorrow 23:59 · 4/7 solved · 2 sent", () => {
    const hw = row(board.rows, HW_ID);
    expect(hw.meta).toEqual([
      { importance: "normal", kind: "importance" },
      { at: HW_DUE, kind: "due", relative: "tomorrow", tz: MOSCOW, zoneDiffers: false },
      { kind: "left", minutes: minutesBetween(ctx().now, HW_DUE) },
      { kind: "solved", solved: 4, total: 7 },
      { kind: "sent", submitted: 2 },
    ]);
    expect(hw).toMatchObject({
      color: "blue",
      dimmed: false,
      projectId: ALGEBRA_ID,
      title: "Algebra HW 6",
    });
    expect(hw.progress).toBeCloseTo(4 / 7, 10);
  });

  it("describes the ASAP reply without a due as ASAP and its age", () => {
    expect(row(board.rows, REPLY_ID).meta).toEqual([
      { importance: "asap", kind: "importance" },
      { kind: "age", minutes: expect.any(Number) as number },
    ]);
  });

  it("describes TRK-231 as Prioritized with its due and the time left, no pace", () => {
    expect(row(board.rows, TRK_ID).meta).toEqual([
      { importance: "prioritized", kind: "importance" },
      { at: TRK_DUE, kind: "due", relative: "later", tz: "UTC", zoneDiffers: true },
      { kind: "left", minutes: minutesBetween(ctx().now, TRK_DUE) },
    ]);
    const thursday = nowViewModel(artboardState(TRK_NOW), ctx(TRK_NOW, "UTC"));
    expect(row(thursday.rows, TRK_ID).meta).toEqual([
      { importance: "prioritized", kind: "importance" },
      { at: TRK_DUE, kind: "due", relative: "tomorrow", tz: "UTC", zoneDiffers: false },
      { kind: "left", minutes: minutesBetween(TRK_NOW, TRK_DUE) },
    ]);
  });

  it("describes Calculus HW 5 as 1 day late · 2 problems left", () => {
    const calc = row(board.rows, CALC_HW5_ID);
    expect(calc.meta).toEqual([
      { importance: "normal", kind: "importance" },
      { isSoft: false, kind: "late", minutes: 15 * 60 + 1 },
      { count: 2, kind: "problems-left" },
    ]);
    expect(CALC_HW5_DUE < ctx().now).toBe(true);
  });

  it("dims the library books: Nice-to-have · 12d old", () => {
    const books = row(board.rows, BOOKS_ID);
    expect(books.meta).toEqual([
      { importance: "nice_to_have", kind: "importance" },
      { kind: "age", minutes: expect.any(Number) as number },
    ]);
    const age = books.meta[1];
    expect(age?.kind === "age" && Math.floor(age.minutes / (24 * 60))).toBe(12);
    expect(books).toMatchObject({ color: "orange", dimmed: true });
  });

  it("offers a chip per project with open tasks", () => {
    expect(board.projects).toEqual([
      { color: "blue", id: ALGEBRA_ID, name: "Algebra", open: 2 },
      { color: "teal", id: CALCULUS_ID, name: "Calculus", open: 2 },
      { color: "violet", id: WORK_ID, name: "Work", open: 3 },
    ]);
    const work = nowViewModel(artboardState(), ctx(), { projectId: WORK_ID });
    expect(work.rows.map((entry) => entry.id)).toHaveLength(3);
    expect(work.inboxCount).toBe(3);
  });
});

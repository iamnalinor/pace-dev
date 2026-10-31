import { describe, expect, it } from "vitest";

import { minutesBetween } from "@pace/core";
import {
  ALGEBRA_ID,
  artboardState,
  at,
  BOOKS_ID,
  CALC_HW5_DUE,
  CALC_HW5_ID,
  CALCULUS_ID,
  ctx,
  HW_DUE,
  HW_ID,
  MOSCOW,
  NOW,
  RENT_FINAL,
  RENT_ID,
  rentSeriesEvents,
  REPLY_ID,
  TRK_DUE,
  TRK_ID,
  TRK_NOW,
  WORK_ID,
} from "@pace/core/testing";

import { groupNowRows, type MetaPart, type NowRow, nowViewModel } from "./now.ts";

const row = (rows: readonly NowRow[], id: string): NowRow => {
  const found = rows.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`${id} is not on the board`);
  }
  return found;
};

describe("nowViewModel", () => {
  const board = nowViewModel(artboardState(), ctx());

  it("groups dated tasks by deadline and undated tasks by importance", () => {
    const groups = groupNowRows(board.rows);
    expect(groups.dated.map((entry) => entry.id)).toEqual(
      board.rows.slice(0, 6).map((entry) => entry.id),
    );
    expect(groups.undated.map((entry) => entry.importance)).toEqual([
      "asap",
      "prioritized",
      "nice_to_have",
    ]);
  });

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
      // A weekly homework instance.
      { kind: "repeats" },
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

  it("describes Calculus HW 5 as 1 day late · 2 subtasks left", () => {
    const calc = row(board.rows, CALC_HW5_ID);
    expect(calc.meta).toEqual([
      { importance: "normal", kind: "importance" },
      { kind: "repeats" },
      { isSoft: false, kind: "late", minutes: 15 * 60 + 1 },
      { count: 2, kind: "subtasks-left" },
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

  it("offers no filter when it could not narrow the list: one project holding every task", () => {
    const state = artboardState();
    const onlyWork = Object.fromEntries(
      Object.entries(state.tasks.byId).filter(
        ([, task]) => task.projectId === WORK_ID || task.presetId === "inbox",
      ),
    );
    const board = nowViewModel({ ...state, tasks: { ...state.tasks, byId: onlyWork } }, ctx());
    expect(board.rows.length).toBeGreaterThan(0);
    expect(board.projects).toEqual([]);
    const empty = nowViewModel({ ...state, tasks: { ...state.tasks, byId: {} } }, ctx());
    expect(empty.projects).toEqual([]);
  });
});

/** Now's rows at `now`, with the monthly rent series (repeating until `until`) in the world. */
const withRent = (now: string, until?: string): readonly NowRow[] => {
  const state = artboardState(now, rentSeriesEvents(until));
  return nowViewModel(state, ctx(now)).rows;
};

/** The rent row's meta at `now` when the series repeats no later than Oct 15. */
const endedRentMeta = (now: string): readonly MetaPart[] =>
  row(withRent(now, "2026-10-15"), RENT_ID).meta;

describe("nowViewModel on a task that has not started yet", () => {
  it("names its past deadline instead of calling it late (QA 13 L7)", () => {
    const early = at(950, "2026-10-01T09:00:00.000Z", {
      type: "task.created",
      payload: {
        dueAt: "2026-10-03T20:59:00.000Z",
        dueTz: MOSCOW,
        fields: {},
        presetId: "personal",
        startAt: "2026-10-07T09:00:00.000Z",
        startTz: MOSCOW,
        subtasks: [],
        taskId: "t-early",
        title: "Starts tomorrow",
      },
    });
    const board = nowViewModel(artboardState(NOW, [early]), ctx());
    const meta = row(board.future, "t-early").meta;
    expect(meta).toContainEqual(expect.objectContaining({ kind: "due" }));
    expect(meta).not.toContainEqual(expect.objectContaining({ kind: "late" }));
    expect(meta).not.toContainEqual(expect.objectContaining({ kind: "left" }));
  });
});

describe("nowViewModel on a repeating task", () => {
  it("marks an instance of a series right after its importance, and no one-off", () => {
    const rows = withRent(NOW);
    expect(row(rows, RENT_ID).meta.slice(0, 2)).toEqual([
      { importance: "normal", kind: "importance" },
      { kind: "repeats" },
    ]);
    expect(row(rows, TRK_ID).meta).not.toContainEqual({ kind: "repeats" });
  });

  it("leaves the mark off the last instance, as its screen calls it the last (QA 14 L9)", () => {
    // No repeat after Oct 15: the instance due Oct 31 is the last one, ahead or behind.
    expect(endedRentMeta("2026-10-10T12:00:00.000Z")).not.toContainEqual({ kind: "repeats" });
    expect(endedRentMeta("2026-10-20T12:00:00.000Z")).not.toContainEqual({ kind: "repeats" });
    expect(endedRentMeta("2026-11-02T12:00:00.000Z")).not.toContainEqual({ kind: "repeats" });
    // One the series repeats after keeps it.
    const later = withRent("2026-10-10T12:00:00.000Z", "2026-11-15");
    expect(row(later, RENT_ID).meta).toContainEqual({ kind: "repeats" });
  });

  it("names the final deadline once the main due date has passed, until it passes too", () => {
    expect(row(withRent(NOW), RENT_ID).meta).not.toContainEqual(
      expect.objectContaining({ kind: "final" }),
    );
    const late = row(withRent("2026-11-02T12:00:00.000Z"), RENT_ID).meta;
    expect(late).toContainEqual(expect.objectContaining({ isSoft: true, kind: "late" }));
    expect(late).toContainEqual({ at: RENT_FINAL, kind: "final", tz: MOSCOW });
    const missed = withRent("2026-11-08T12:00:00.000Z").find((entry) => entry.id === RENT_ID);
    expect(missed?.meta ?? []).not.toContainEqual(expect.objectContaining({ kind: "final" }));
    // Past both: the row says the final deadline went by too (QA 13 L10).
    expect(missed?.meta ?? []).toContainEqual({ at: RENT_FINAL, kind: "final-passed", tz: MOSCOW });
  });
});

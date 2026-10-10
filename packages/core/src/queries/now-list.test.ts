import { describe, expect, it } from "vitest";

import { at, HW_DUE, HW_ID, TRK_DUE, TRK_ID } from "../materialize/task-fixture.fake.ts";
import {
  ALGEBRA_ID,
  artboardState,
  BOOKS_ID,
  CALC_HW5_DUE,
  CALC_HW5_ID,
  CALC_W41_ID,
  ctx,
  DEFERRED_IDS,
  DEMO_ID,
  GRADE_ID,
  HISTORY_W40_ID,
  INBOX_IDS,
  MOSCOW,
  NOW,
  REPLY_ID,
  RFC_ID,
  WORK_ID,
} from "./fixture.fake.ts";
import { type NowItem, type NowList, nowList } from "./now-list.ts";

const ids = (items: readonly NowItem[]): readonly string[] => items.map((item) => item.task.id);

const item = (list: NowList, id: string): NowItem => {
  const found = [...list.items, ...list.future].find((entry) => entry.task.id === id);
  if (found === undefined) {
    throw new Error(`${id} is not on the list`);
  }
  return found;
};

describe("nowList", () => {
  const list = nowList(artboardState(), ctx());

  it("orders by the deadline only: the nearest first, tasks without one after, oldest first", () => {
    expect(ids(list.items)).toEqual([
      CALC_HW5_ID,
      HW_ID,
      HISTORY_W40_ID,
      DEMO_ID,
      TRK_ID,
      CALC_W41_ID,
      BOOKS_ID,
      RFC_ID,
      REPLY_ID,
    ]);
  });

  it("shows this week's empty instances: the plan is there before the homework text", () => {
    expect(ids(list.items)).toEqual(expect.arrayContaining([CALC_W41_ID, HISTORY_W40_ID]));
  });

  it("folds tasks that start later under In future, the earliest start first", () => {
    expect(ids(list.future)).toEqual([DEFERRED_IDS[1], GRADE_ID, DEFERRED_IDS[0], DEFERRED_IDS[2]]);
    expect(list.inboxCount).toBe(INBOX_IDS.length);
  });

  it("reads a task once marked waiting as in progress, in its deadline place", () => {
    expect(item(list, DEMO_ID).task.status).toBe("in_progress");
    expect(item(list, RFC_ID).task.status).toBe("in_progress");
  });

  it("shows Algebra HW 6 due tomorrow 23:59 · 4/7 solved · 2 sent", () => {
    const hw = item(list, HW_ID);
    expect(hw.project?.name).toBe("Algebra");
    expect(hw.importance).toBe("normal");
    expect(hw).toMatchObject({ solved: 4, total: 7, submitted: 2, dueAt: HW_DUE, dueTz: MOSCOW });
    expect(hw.progress).toBeCloseTo(4 / 7, 10);
    expect(hw.isLate).toBe(false);
  });

  it("keeps the explicit due of TRK-231, never a horizon its importance would imply", () => {
    const trk = item(list, TRK_ID);
    expect(trk.importance).toBe("prioritized");
    expect(trk.project?.id).toBe(WORK_ID);
    expect(trk.dueAt).toBe(TRK_DUE);
  });

  it("gives an ASAP task without a due no due at all", () => {
    expect(item(list, REPLY_ID)).toMatchObject({ importance: "asap", dueAt: null, dueTz: null });
  });

  it("shows Calculus HW 5 as late with 2 problems left", () => {
    const calc = item(list, CALC_HW5_ID);
    expect(calc).toMatchObject({
      solved: 3,
      total: 5,
      submitted: 3,
      dueAt: CALC_HW5_DUE,
      lateMinutes: 15 * 60 + 1,
      isLate: true,
    });
  });

  it("filters by project but keeps the global inbox counter", () => {
    const algebra = nowList(artboardState(), ctx(), { projectId: ALGEBRA_ID });
    expect(ids(algebra.items)).toEqual([HW_ID]);
    expect(ids(algebra.future)).toEqual([GRADE_ID]);
    expect(algebra.inboxCount).toBe(3);
    const work = nowList(artboardState(), ctx(), { projectId: WORK_ID });
    expect(ids(work.items)).toEqual([DEMO_ID, TRK_ID, RFC_ID]);
  });

  it("moves a task to the main list once its start has come", () => {
    const later = nowList(artboardState(), ctx("2026-10-20T06:00:00.000Z"));
    expect(ids(later.items)).toContain(GRADE_ID);
    expect(ids(later.future)).not.toContain(GRADE_ID);
  });

  it("leaves out a task whose preset cannot be resolved", () => {
    const state = artboardState(NOW, [
      at(71, "2026-10-06T10:00:00.000Z", {
        type: "task.created",
        payload: {
          taskId: "t-broken",
          title: "Broken",
          presetId: "nope",
          subtasks: [],
          fields: {},
        },
      }),
    ]);
    const broken = nowList(state, ctx());
    expect(ids([...broken.items, ...broken.future])).not.toContain("t-broken");
  });
});

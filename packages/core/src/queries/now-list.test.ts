import { describe, expect, it } from "vitest";

import { at, HW_DUE, HW_ID, TRK_ID } from "../materialize/task-fixture.fake.ts";
import { endOfDayIn } from "../time.ts";
import {
  ALGEBRA_ID,
  artboardState,
  BOOKS_ID,
  CALC_HW5_DUE,
  CALC_HW5_ID,
  ctx,
  DEMO_ID,
  GRADE_ID,
  INBOX_IDS,
  LATER_IDS,
  MOSCOW,
  NOW,
  REPLY_ID,
  RFC_ID,
  WAITING_IDS,
  WORK_ID,
} from "./fixture.fake.ts";
import { type NowItem, type NowList, nowList } from "./now-list.ts";

const ids = (items: readonly NowItem[]): readonly string[] => items.map((item) => item.task.id);

const item = (list: NowList, id: string): NowItem => {
  const found = [...list.items, ...list.waiting].find((entry) => entry.task.id === id);
  if (found === undefined) {
    throw new Error(`${id} is not on the list`);
  }
  return found;
};

describe("nowList", () => {
  const list = nowList(artboardState(), ctx());

  it("orders the open tasks by score: the overdue sheet, the ASAP, TRK-231, HW 6, the old errand", () => {
    expect(ids(list.items)).toEqual([CALC_HW5_ID, REPLY_ID, TRK_ID, HW_ID, BOOKS_ID]);
    const scores = list.items.map((entry) => entry.score.score);
    expect(scores).toEqual([...scores].toSorted((a, b) => b - a));
  });

  it("counts what is folded away: + 6 later · 2 waiting, inbox 3", () => {
    expect(list.laterCount).toBe(LATER_IDS.length);
    expect(ids(list.waiting)).toEqual([...WAITING_IDS]);
    expect(list.inboxCount).toBe(INBOX_IDS.length);
    expect(ids(list.items)).not.toContain(GRADE_ID);
  });

  it("shows Algebra HW 6 due tomorrow 23:59 · 4/7 solved · 2 sent with the pace marker", () => {
    const hw = item(list, HW_ID);
    expect(hw.project?.name).toBe("Algebra");
    expect(hw.preset.urgencyPolicy).toBe("resubmission");
    expect(hw.importance).toBe("normal");
    expect(hw).toMatchObject({ solved: 4, total: 7, submitted: 2, dueAt: HW_DUE, dueTz: MOSCOW });
    expect(hw.progress).toBeCloseTo(4 / 7, 10);
    // Issued Monday 10:00 Moscow, due Wednesday 23:59: 29 of the 62 hours are gone.
    expect(hw.paceExpected).toBeCloseTo(29 / (62 - 1 / 60), 6);
    expect(hw.lateMinutes).toBeNull();
    expect(hw.isLate).toBe(false);
  });

  it("gives the ASAP reply the end of the day in the account zone as its due", () => {
    const reply = item(list, REPLY_ID);
    expect(reply.importance).toBe("asap");
    expect(reply.dueAt).toBe(endOfDayIn(NOW, MOSCOW));
    expect(reply.dueTz).toBe(MOSCOW);
    expect(reply.project).toBeNull();
    expect(reply.paceExpected).toBeCloseTo(4 / 13, 3);
    expect(reply.isLate).toBe(false);
  });

  it("marks TRK-231 as Prioritized with the pace of its explicit window", () => {
    const trk = item(list, TRK_ID);
    expect(trk.importance).toBe("prioritized");
    expect(trk.project?.id).toBe(WORK_ID);
    expect(trk.progress).toBeCloseTo(0.4, 10);
    // Started Monday 09:00, due Friday 18:00: 27 of 105 hours gone on Tuesday 12:00.
    expect(trk.paceExpected).toBeCloseTo(27 / 105, 10);
    // Prioritized on Monday 09:00, so the three-day horizon undercuts the Friday deadline.
    expect(trk.dueAt).toBe("2026-10-08T09:00:00.000Z");
    expect(trk.dueTz).toBe(MOSCOW);
    expect(trk.score.rankBonus).toBeCloseTo(0.1 / 3, 10);
  });

  it("shows Calculus HW 5 as 1 day late with 2 problems left", () => {
    const calc = item(list, CALC_HW5_ID);
    expect(calc).toMatchObject({
      solved: 3,
      total: 5,
      submitted: 3,
      dueAt: CALC_HW5_DUE,
      lateMinutes: 15 * 60 + 1,
      isLate: true,
      paceExpected: 1,
    });
    expect(calc.total - calc.submitted).toBe(2);
  });

  it("shows the library books as a 12-day-old Nice-to-have without a due", () => {
    const books = item(list, BOOKS_ID);
    expect(books.importance).toBe("nice_to_have");
    expect(books.score.policy).toBe("age");
    expect(books).toMatchObject({
      dueAt: null,
      dueTz: null,
      paceExpected: null,
      lateMinutes: null,
    });
    expect(Date.parse(NOW) - Date.parse(books.task.createdAt)).toBe(12 * 24 * 3_600_000);
  });

  it("filters by project but keeps the global inbox counter", () => {
    const algebra = nowList(artboardState(), ctx(), { projectId: ALGEBRA_ID });
    expect(ids(algebra.items)).toEqual([HW_ID]);
    expect(algebra.waiting).toEqual([]);
    expect(algebra.laterCount).toBe(1);
    expect(algebra.inboxCount).toBe(3);
    const work = nowList(artboardState(), ctx(), { projectId: WORK_ID });
    expect(ids(work.items)).toEqual([TRK_ID]);
    expect(ids(work.waiting)).toEqual([DEMO_ID, RFC_ID]);
    expect(work.laterCount).toBe(0);
  });

  it("keeps a waiting task with a future start among the later ones", () => {
    const state = artboardState(NOW, [
      at(70, "2026-10-06T10:00:00.000Z", {
        type: "task.status.set",
        payload: { taskId: GRADE_ID, status: "waiting" },
      }),
    ]);
    const later = nowList(state, ctx());
    expect(later.laterCount).toBe(LATER_IDS.length);
    expect(ids(later.waiting)).toEqual([DEMO_ID, RFC_ID]);
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
    expect(ids([...broken.items, ...broken.waiting])).not.toContain("t-broken");
    expect(broken.laterCount).toBe(LATER_IDS.length);
  });
});

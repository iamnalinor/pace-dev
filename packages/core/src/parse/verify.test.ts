import { describe, expect, it } from "vitest";

import type { ProposalContext } from "../proposals/context.ts";

import { normalizeForEvidence } from "./normalize.ts";
import { blankModelAction as blankAction, type ModelAction } from "./schema.ts";
import { readWallClock, verifyAction } from "./verify.ts";

const SOURCE = "Дз 7 по алгебре: задачи 1, 3, 5а до среды 23:59, часа на два";
const MOSCOW = "Europe/Moscow";

const context: ProposalContext = {
  activities: [
    {
      alias: "a1",
      category: "other",
      endAt: "2026-10-14T05:30:00.000Z",
      id: "act-1",
      label: "Военкомат",
      startAt: "2026-10-14T04:30:00.000Z",
    },
  ],
  tasks: [
    { alias: "t1", id: "task-1", title: "Algebra HW 6" },
    { alias: "t2", id: "task-2", title: "Ян" },
  ],
};

const verify = (action: Partial<ModelAction>, source = SOURCE) =>
  verifyAction(blankAction(action), {
    context,
    projectNames: ["Algebra"],
    source,
    zone: MOSCOW,
  });

const doubts = (action: Partial<ModelAction>, source = SOURCE) => {
  const verified = verify(action, source);
  return verified.ok ? verified.value.doubtful : verified;
};

describe("normalizeForEvidence", () => {
  it("folds case, ё, dashes, spaces and Latin lookalikes", () => {
    expect(normalizeForEvidence("  Ёлка —  TOP ")).toBe(normalizeForEvidence("елка - тор"));
    expect(normalizeForEvidence("Algebra")).not.toBe(normalizeForEvidence("алгебра"));
  });
});

describe("verifyAction: text and numbers", () => {
  it("accepts strings copied from the message and numbers with a quote", () => {
    expect(
      doubts({
        dueDate: "2026-10-07",
        dueTime: "23:59",
        estimateMinutes: 120,
        evidence: [
          { field: "dueDate", quote: "до среды" },
          { field: "dueTime", quote: "23:59" },
          { field: "estimateMinutes", quote: "часа на два" },
        ],
        project: "Algebra",
        subtasks: [
          { label: "1", number: 1 },
          { label: "5а", number: 5 },
        ],
        title: "Дз 7 по алгебре",
      }),
    ).toEqual([]);
  });

  it("marks invented numbers, foreign titles and words not in the message", () => {
    expect(
      doubts({
        description: "Solve carefully",
        estimateMinutes: 90,
        project: "Geometry",
        subtasks: [{ label: "9", number: 9 }],
        title: "Algebra homework 7",
      }),
    ).toEqual(["title", "description", "project", "subtasks", "estimateMinutes"]);
  });

  it("marks an activity's times and length without a quote, and a label in another language", () => {
    const source = "ходил в военкомат с 7:30 до 8:30";
    expect(
      doubts(
        {
          end: "2026-10-14 08:30",
          evidence: [{ field: "start", quote: "с 7:30" }],
          kind: "activity.log",
          label: "Military office",
          start: "2026-10-14 07:30",
        },
        source,
      ),
    ).toEqual(["label", "end"]);
  });
});

describe("verifyAction: references", () => {
  it("maps an alias of the lists back to what the model was shown", () => {
    const verified = verify({ kind: "task.close", outcome: "done", task: "t1" });
    expect(verified).toMatchObject({ ok: true, value: { task: { id: "task-1" } } });
    expect(verify({ activity: "a1", kind: "activity.update", label: "Военкомат" })).toMatchObject({
      ok: true,
      value: { activity: { id: "act-1" } },
    });
  });

  it("refuses an alias that was not in the lists, or an id instead of one", () => {
    expect(verify({ kind: "task.close", task: "t3" })).toEqual({
      error: "proposal/unknown-task",
      ok: false,
    });
    expect(verify({ kind: "task.update", task: "task-1" })).toEqual({
      error: "proposal/unknown-task",
      ok: false,
    });
    expect(verify({ kind: "task.markSubtasks", task: null })).toEqual({
      error: "proposal/unknown-task",
      ok: false,
    });
    expect(verify({ activity: "a9", kind: "activity.delete", quote: "x" })).toEqual({
      error: "proposal/unknown-activity",
      ok: false,
    });
  });

  it("takes a short title as quoted only as whole words, not inside another word", () => {
    expect(verify({ kind: "task.delete", quote: "позвонить Ян", task: "t2" }).ok).toBe(true);
    for (const quote of ["Янтарь", "купить янтарь"]) {
      expect(verify({ kind: "task.delete", quote, task: "t2" })).toEqual({
        error: "proposal/unquoted-delete",
        ok: false,
      });
    }
  });

  it("deletes only an item whose title the model quoted as listed", () => {
    expect(verify({ kind: "task.delete", quote: "Algebra HW 6", task: "t1" }).ok).toBe(true);
    expect(verify({ kind: "task.delete", quote: "algebra hw 6", task: "t1" }).ok).toBe(true);
    for (const quote of [null, "Algebra", "Geometry HW 6"]) {
      expect(verify({ kind: "task.delete", quote, task: "t1" })).toEqual({
        error: "proposal/unquoted-delete",
        ok: false,
      });
    }
    expect(verify({ activity: "a1", kind: "activity.delete", quote: "Военкомат" }).ok).toBe(true);
    expect(verify({ activity: "a1", kind: "activity.delete", quote: "Сон" })).toEqual({
      error: "proposal/unquoted-delete",
      ok: false,
    });
  });
});

describe("verifyAction: times", () => {
  it("reads start and end on the account's clock", () => {
    expect(
      verify({ end: "2026-10-14 08:30", kind: "activity.log", start: "2026-10-14 07:30" }),
    ).toMatchObject({
      ok: true,
      value: { end: "2026-10-14T05:30:00.000Z", start: "2026-10-14T04:30:00.000Z" },
    });
  });

  it("refuses a time that names no real minute", () => {
    for (const start of ["2026-02-30 07:30", "2026-10-14 24:10", "2026-10-14 07:61"]) {
      expect(verify({ kind: "activity.log", start })).toEqual({
        error: "proposal/bad-time",
        ok: false,
      });
    }
    expect(readWallClock("2026-10-14 07:30", MOSCOW)).toBe("2026-10-14T04:30:00.000Z");
  });
});

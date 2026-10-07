import { describe, expect, it } from "vitest";

import type { ParseResult } from "./schema.ts";

import { HW_ID } from "../materialize/task-fixture.fake.ts";
import { ALGEBRA_ID, artboardState, ctx, MOSCOW, WORK_ID } from "../queries/fixture.fake.ts";
import { findTaskRef, parseToQuickInput, planParse, wallClockInstant } from "./apply.ts";
import { verifyParse } from "./verify.ts";

const state = artboardState();
const world = { ctx: ctx(), state };

const empty: ParseResult = {
  category: null,
  description: null,
  dueDate: null,
  dueTime: null,
  estimateMinutes: null,
  evidence: [],
  importance: null,
  intent: "create_task",
  outcome: null,
  project: null,
  questions: [],
  subtasks: [],
  task: null,
  title: null,
};

const verified = (text: string, result: Partial<ParseResult>) =>
  verifyParse({ ...empty, ...result }, { projectNames: ["Algebra", "Work"], source: text });

describe("wallClockInstant", () => {
  it("reads the date and time on the zone's wall clock", () => {
    expect(wallClockInstant("2026-10-07", "23:59", MOSCOW)).toBe("2026-10-07T20:59:00.000Z");
  });
});

describe("parseToQuickInput", () => {
  it("lets the LLM's fields win and the rules fill the rest", () => {
    const text = "созвониться с Петей про дашборд в пятницу вечером";
    const input = parseToQuickInput(
      verified(text, {
        category: "work",
        dueDate: "2026-10-09",
        dueTime: "19:00",
        project: "Work",
        title: "созвониться с Петей про дашборд",
      }),
      text,
      world,
    );
    expect(input).toMatchObject({
      dueAt: "2026-10-09T16:00:00.000Z",
      dueTz: MOSCOW,
      importance: "normal",
      presetId: "work",
      projectId: WORK_ID,
      title: "созвониться с Петей про дашборд",
      text,
    });
  });

  it("creates a project the LLM named that does not exist yet", () => {
    const text = "plan the Japan trip";
    const input = parseToQuickInput(verified(text, { project: "Japan" }), text, world);
    expect(input).toMatchObject({ projectId: null, projectName: "Japan" });
  });
});

describe("findTaskRef", () => {
  it("finds an open task by id or by its title", () => {
    expect(findTaskRef(state, HW_ID)).toMatchObject({ ok: true, value: { id: HW_ID } });
    expect(findTaskRef(state, "algebra hw 6")).toMatchObject({ ok: true, value: { id: HW_ID } });
    expect(findTaskRef(state, "nothing like it")).toEqual({
      error: "parse/unknown-task",
      ok: false,
    });
  });
});

describe("planParse", () => {
  it("marks the named problems solved", () => {
    const text = "решил 5 и 6 в алгебре";
    const plan = planParse(
      verified(text, {
        intent: "mark_subtasks",
        subtasks: [
          { label: "5", number: 5 },
          { label: "6", number: 6 },
        ],
        task: "Algebra HW 6",
      }),
      text,
      world,
    );
    expect(plan).toMatchObject({
      ok: true,
      value: {
        bodies: [
          { payload: { subtaskId: "s5", taskId: HW_ID }, type: "task.subtask.solved" },
          { payload: { subtaskId: "s6", taskId: HW_ID }, type: "task.subtask.solved" },
        ],
        kind: "update",
        taskId: HW_ID,
      },
    });
  });

  it("adds problems and keeps the message as a source", () => {
    const text = "в дз по алгебре ещё задача 8";
    const plan = planParse(
      verified(text, { intent: "add_to_task", subtasks: [{ label: "8", number: 8 }], task: HW_ID }),
      text,
      world,
    );
    expect(
      plan.ok && plan.value.kind === "update" ? plan.value.bodies.map((b) => b.type) : [],
    ).toEqual(["task.subtasks.added", "task.source.attached"]);
  });

  it("returns a new task as composer fields", () => {
    const text = "алгебра: выучить теорему";
    expect(planParse(verified(text, { category: "hw.algebra" }), text, world)).toMatchObject({
      ok: true,
      value: { input: { presetId: "hw.algebra", projectId: ALGEBRA_ID }, kind: "create" },
    });
  });

  it("refuses what it cannot place", () => {
    expect(planParse(verified("hm", { intent: "unknown" }), "hm", world)).toEqual({
      error: "parse/unknown-intent",
      ok: false,
    });
  });
});

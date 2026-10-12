import { describe, expect, it } from "vitest";

import { HW_ID } from "../materialize/task-fixture.fake.ts";
import { artboardState, ctx, MOSCOW, NOW, WORK_ID } from "../queries/fixture.fake.ts";
import { instanceBodies, quickInputBodies } from "./compose.ts";
import { parseQuickInput, type QuickInput } from "./parse-quick-input.ts";

const state = artboardState();
const counter = (): (() => string) => {
  let next = 0;
  return () => {
    next += 1;
    return `id-${String(next)}`;
  };
};
const bodiesFor = (text: string, patch: Partial<QuickInput> = {}) =>
  quickInputBodies(
    { ...parseQuickInput(text, state, ctx()), ...patch },
    { now: NOW, state },
    counter(),
  );

describe("instanceBodies", () => {
  it("brings an instance made ahead onto Now once its homework is added", () => {
    const hw = state.tasks.byId[HW_ID];
    if (hw === undefined) {
      throw new Error("no HW");
    }
    const ahead = { ...hw, startAt: "2026-10-12T07:00:00.000Z", startTz: MOSCOW };
    const input = parseQuickInput("дз по алгебре 9", state, ctx());
    expect(instanceBodies(input, ahead, { newId: counter(), now: NOW })).toContainEqual({
      payload: { startAt: NOW, startTz: MOSCOW, taskId: HW_ID },
      type: "task.updated",
    });
    expect(
      instanceBodies(input, hw, { newId: counter(), now: NOW }).some(
        (body) => body.type === "task.updated" && "startAt" in body.payload,
      ),
    ).toBe(false);
  });
});

describe("quickInputBodies", () => {
  it("creates a task with its fields and the text as its source", () => {
    expect(bodiesFor("синк по дашборду завтра 15:00 1ч")).toEqual([
      {
        type: "task.created",
        payload: {
          dueAt: "2026-10-07T12:00:00.000Z",
          dueTz: MOSCOW,
          estimateMinutes: 60,
          fields: {},
          importance: "normal",
          presetId: "work",
          projectId: WORK_ID,
          sourceText: "синк по дашборду завтра 15:00 1ч",
          subtasks: [],
          taskId: "id-1",
          title: "синк по дашборду",
        },
      },
    ]);
  });

  it("creates a new project named by a tag first", () => {
    expect(bodiesFor("plan the trip #Japan").map((body) => body.type)).toEqual([
      "project.created",
      "task.created",
    ]);
  });

  it("adds problems to this week's homework instead of a new task", () => {
    const bodies = bodiesFor("дз по алгебре 8, 9");
    expect(bodies.map((body) => body.type)).toEqual([
      "task.subtasks.added",
      "task.source.attached",
    ]);
    expect(bodies[0]?.payload).toMatchObject({ taskId: HW_ID });
  });

  it("adds homework due the same day as an open instance to that instance", () => {
    // HW 6 is due Wednesday 23:59 Moscow; a due later that Wednesday is the same homework.
    const bodies = bodiesFor("дз по алгебре 8", {
      dueAt: "2026-10-07T15:00:00.000Z",
      dueTz: MOSCOW,
    });
    expect(bodies[0]?.payload).toMatchObject({ taskId: HW_ID });
  });

  it("makes a task of its own for homework with an explicit due on another day", () => {
    const bodies = bodiesFor("дз по алгебре 8", {
      dueAt: "2026-10-09T20:59:00.000Z",
      dueTz: MOSCOW,
    });
    expect(bodies.map((body) => body.type)).toEqual(["task.created"]);
    expect(bodies[0]?.payload).toMatchObject({
      dueAt: "2026-10-09T20:59:00.000Z",
      presetId: "hw.algebra",
    });
  });

  it("brings the description, the link and a stated estimate to the instance", () => {
    const bodies = bodiesFor("дз по алгебре https://example.com/sheet 2ч", {
      description: "Решить методом выделения линейных множителей",
      subtasks: [{ label: "8", number: 8 }],
    });
    expect(bodies.map((body) => body.type)).toEqual([
      "task.subtasks.added",
      "task.updated",
      "task.estimate.set",
      "task.source.attached",
    ]);
    expect(bodies[1]?.payload).toEqual({
      description: "Решить методом выделения линейных множителей",
      fields: { link: "https://example.com/sheet" },
      taskId: HW_ID,
    });
    expect(bodies[2]?.payload).toEqual({ estimateMinutes: 120, taskId: HW_ID });
  });

  it("keeps the description on a new task", () => {
    const bodies = bodiesFor("синк по дашборду", { description: "Обсудить метрики" });
    expect(bodies[0]?.payload).toMatchObject({ description: "Обсудить метрики" });
  });
});

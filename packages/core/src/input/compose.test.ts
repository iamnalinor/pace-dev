import { describe, expect, it } from "vitest";

import { HW_ID } from "../materialize/task-fixture.fake.ts";
import { artboardState, ctx, MOSCOW, NOW, WORK_ID } from "../queries/fixture.fake.ts";
import { quickInputBodies } from "./compose.ts";
import { parseQuickInput } from "./parse-quick-input.ts";

const state = artboardState();
const counter = (): (() => string) => {
  let next = 0;
  return () => {
    next += 1;
    return `id-${String(next)}`;
  };
};
const bodiesFor = (text: string) =>
  quickInputBodies(parseQuickInput(text, state, ctx()), { now: NOW, state }, counter());

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
    expect(bodies.map((body) => body.type)).toEqual(["task.subtasks.added", "task.source.attached"]);
    expect(bodies[0]?.payload).toMatchObject({ taskId: HW_ID });
  });
});

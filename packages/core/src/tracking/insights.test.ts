import { describe, expect, it } from "vitest";

import { coreReducer, INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { materialize } from "../materialize/materializer.ts";
import { at } from "../materialize/task-fixture.fake.ts";
import {
  estimateVsTracked,
  onTimeByProject,
  taskTrackedMinutes,
  timeByCategory,
  timeByProject,
  weeklyProjectMinutes,
} from "./insights.ts";
import { act, start, T } from "./tracking.fake.ts";

const world = materialize(
  [
    at(1, T("00:00"), { payload: { color: "blue", name: "Algebra", projectId: "p-alg" }, type: "project.created" }),
    at(2, T("00:00"), {
      payload: {
        dueAt: T("23:00"),
        estimateMinutes: 90,
        presetId: "personal",
        projectId: "p-alg",
        subtasks: [],
        taskId: "t-sheet",
        title: "Sheet 7",
      },
      type: "task.created",
    }),
    start("08:00", "a1", "Sheet 7", { category: "study", taskId: "t-sheet" }),
    start("10:00", "a2", "Lunch", { category: "food" }),
    act("10:30", { payload: { activityId: "a2" }, type: "activity.stopped" }),
    at(3, T("11:00"), { payload: { outcome: "done", taskId: "t-sheet" }, type: "task.closed" }),
  ],
  coreReducer,
  INITIAL_CORE_STATE,
);
const DAY = { from: T("00:00"), now: T("12:00"), to: "2026-10-08T00:00:00.000Z" };

describe("insights", () => {
  it("sums the day by category and by project", () => {
    expect(timeByCategory(world, DAY)).toEqual([
      { category: "study", minutes: 120 },
      { category: "food", minutes: 30 },
    ]);
    expect(timeByProject(world, DAY)).toEqual([
      { minutes: 120, projectId: "p-alg" },
      { minutes: 30, projectId: null },
    ]);
  });

  it("counts a task's tracked time and compares it with the estimate", () => {
    expect(taskTrackedMinutes(world, "t-sheet", T("12:00"))).toBe(120);
    expect(estimateVsTracked(world, DAY)).toEqual([
      { estimateMinutes: 90, taskId: "t-sheet", title: "Sheet 7", trackedMinutes: 120 },
    ]);
  });

  it("rates projects on time and spreads their hours over the weeks", () => {
    expect(onTimeByProject(world, DAY)).toEqual([{ onTime: 1, projectId: "p-alg", total: 1 }]);
    expect(weeklyProjectMinutes(world, "p-alg", { now: T("12:00"), weeks: 3, zone: "UTC" })).toEqual([0, 0, 120]);
  });
});

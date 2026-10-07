import { describe, expect, it } from "vitest";

import { coreReducer, INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { materializeAt } from "../materialize/materializer.ts";
import { at } from "../materialize/task-fixture.fake.ts";
import { INITIAL_NOTIFY_MEMORY } from "./evaluate.ts";
import { notifyPlan } from "./plan.ts";

const MOSCOW = "Europe/Moscow";
const NOW = "2026-10-06T12:00:00.000Z";

const state = materializeAt(
  [
    at(1, "2026-10-01T06:00:00.000Z", { type: "settings.updated", payload: { timezone: MOSCOW } }),
    at(2, "2026-10-05T07:00:00.000Z", {
      type: "task.created",
      payload: {
        taskId: "t-report",
        title: "Write the report",
        presetId: "personal",
        importance: "normal",
        dueAt: "2026-10-08T09:00:00.000Z",
        dueTz: MOSCOW,
        subtasks: [],
        fields: {},
      },
    }),
  ],
  NOW,
  { reducer: coreReducer, initial: INITIAL_CORE_STATE },
);

describe("notifyPlan", () => {
  it("lists the next day's digest windows and deadline crossings outside the quiet hours", () => {
    expect(notifyPlan(state, { deviceTz: MOSCOW, now: NOW }, INITIAL_NOTIFY_MEMORY)).toEqual([
      { at: "2026-10-06T18:00:00.000Z", kind: "digest" },
      { at: "2026-10-07T06:00:00.000Z", kind: "digest" },
      {
        at: "2026-10-07T09:00:00.000Z",
        kind: "deadline",
        taskId: "t-report",
        title: "Write the report",
      },
      { at: "2026-10-07T11:00:00.000Z", kind: "digest" },
    ]);
  });
});

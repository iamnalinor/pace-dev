import { describe, expect, it } from "vitest";

import { NOW } from "@pace/core/testing";

import { setupActions, unwrap } from "../actions/fixture.fake.ts";
import { exportSheets } from "./export.ts";

const LECTURE_START = new Date(Date.parse(NOW) - 90 * 60_000).toISOString();

describe("the spreadsheet export", () => {
  it("has a sheet per kind of record, with a header and one row each", async () => {
    const world = await setupActions();
    unwrap(
      await world.actions.logPast({
        category: "study",
        endAt: NOW,
        label: "Lecture",
        startAt: LECTURE_START,
      }),
    );
    const state = world.state.store.getState();
    const sheets = exportSheets(state, NOW);
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "tasks",
      "subtasks",
      "activities",
      "projects",
      "events",
    ]);
    const byName = Object.fromEntries(sheets.map((sheet) => [sheet.name, sheet]));
    expect(byName["tasks"]?.rows).toHaveLength(Object.keys(state.tasks.byId).length);
    expect(byName["events"]?.rows).toHaveLength(state.log.length);
    expect(byName["activities"]?.rows).toContainEqual([
      expect.any(String),
      LECTURE_START,
      NOW,
      90,
      "Lecture",
      "study",
      null,
      "yes",
    ]);
    for (const sheet of sheets) {
      expect(sheet.rows.every((row) => row.length === sheet.columns.length)).toBe(true);
    }
  });
});

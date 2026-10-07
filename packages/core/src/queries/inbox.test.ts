import { describe, expect, it } from "vitest";

import { at } from "../materialize/task-fixture.fake.ts";
import {
  ALGEBRA_ID,
  artboardState,
  ctx,
  INBOX_CABLE_ID,
  INBOX_GRADE_ID,
  INBOX_SYNC_ID,
  NOW,
  WORK_ID,
} from "./fixture.fake.ts";
import { inboxList, UNSORTED_TOO_LONG_MINUTES } from "./inbox.ts";

const DAY = 24 * 60;

describe("inboxList", () => {
  const items = inboxList(artboardState(), ctx());

  it("lists the open inbox items oldest first with their age", () => {
    expect(items.map((item) => item.task.id)).toEqual([
      INBOX_CABLE_ID,
      INBOX_GRADE_ID,
      INBOX_SYNC_ID,
    ]);
    expect(items.map((item) => item.ageMinutes)).toEqual([6 * DAY, 2 * DAY, 5 * 60]);
  });

  it("flags what has been unsorted for more than three days", () => {
    expect(UNSORTED_TOO_LONG_MINUTES).toBe(3 * DAY);
    expect(items.map((item) => item.unsortedTooLong)).toEqual([true, false, false]);
  });

  it("carries the rule-based suggestion of the artboard cards", () => {
    expect(items.map((item) => item.suggestion)).toEqual([
      {
        presetId: "personal",
        projectId: null,
        importance: "nice_to_have",
        dueAt: null,
        dueTz: null,
      },
      {
        presetId: "personal",
        projectId: ALGEBRA_ID,
        importance: "nice_to_have",
        dueAt: null,
        dueTz: null,
      },
      {
        presetId: "work",
        projectId: WORK_ID,
        importance: "prioritized",
        dueAt: "2026-10-09T20:59:00.000Z",
        dueTz: "Europe/Moscow",
      },
    ]);
  });

  it("leaves out sorted and closed items", () => {
    const state = artboardState(NOW, [
      at(81, "2026-10-06T10:00:00.000Z", {
        type: "task.preset.set",
        payload: { taskId: INBOX_GRADE_ID, presetId: "personal" },
      }),
      at(82, "2026-10-06T10:00:00.000Z", {
        type: "task.closed",
        payload: { taskId: INBOX_CABLE_ID, outcome: "cancelled" },
      }),
    ]);
    expect(inboxList(state, ctx()).map((item) => item.task.id)).toEqual([INBOX_SYNC_ID]);
  });
});

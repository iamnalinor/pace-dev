import { describe, expect, it } from "vitest";

import { type Activity, type ActivityCategory, INITIAL_TIME_STATE } from "@pace/core";
import { artboardState, CALC_HW5_ID, ctx, RFC_ID } from "@pace/core/testing";

import { detailsModel, recentLabels } from "./activity-details.ts";

const activity = (label: string, category: ActivityCategory, startAt: string): Activity => ({
  buttonId: null,
  category,
  endAt: new Date(Date.parse(startAt) + 30 * 60_000).toISOString(),
  expectMinutes: null,
  id: `a-${label}-${startAt}`,
  isLogged: true,
  label,
  limitMinutes: null,
  messengersOnPurpose: false,
  startAt,
  taskId: null,
});

describe("detailsModel", () => {
  it("offers the open homework for Study and the open work for Work", () => {
    const state = artboardState();
    const study = detailsModel(state, { category: "study", label: "Study" }, ctx());
    expect(study.tasks.map((task) => task.id)).toContain(CALC_HW5_ID);
    expect(study.tasks.map((task) => task.id)).not.toContain(RFC_ID);
    const work = detailsModel(state, { category: "work", label: "Work" }, ctx());
    expect(work.tasks.map((task) => task.id)).toContain(RFC_ID);
    expect(work.tasks.map((task) => task.id)).not.toContain(CALC_HW5_ID);
    expect(detailsModel(state, { category: "food", label: "Food" }, ctx()).tasks).toEqual([]);
  });
});

describe("recentLabels", () => {
  it("lists distinct labels newest first, within a category when one is given", () => {
    const activities = [
      activity("lecture", "study", "2026-10-01T09:00:00.000Z"),
      activity("Reading", "other", "2026-10-02T09:00:00.000Z"),
      activity("Lecture", "study", "2026-10-03T09:00:00.000Z"),
    ];
    const time = {
      ...INITIAL_TIME_STATE,
      activities: Object.fromEntries(activities.map((a) => [a.id, a])),
    };
    expect(recentLabels(time)).toEqual(["Lecture", "Reading"]);
    expect(recentLabels(time, "study")).toEqual(["Lecture"]);
  });
});

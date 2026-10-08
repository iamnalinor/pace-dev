import { describe, expect, it } from "vitest";

import type { Activity, ActivityCategory, CoreState } from "@pace/core";

import { artboardState, ctx, MOSCOW, NOW } from "@pace/core/testing";

import { dayModel, trackedDates } from "./day.ts";

type Spec = {
  readonly id: string;
  readonly label: string;
  readonly category: ActivityCategory;
  readonly startAt: string;
  readonly endAt: null | string;
  readonly expect?: null | number;
  readonly limit?: null | number;
};

const activity = ({
  category,
  endAt,
  expect = null,
  id,
  label,
  limit = null,
  startAt,
}: Spec): Activity => ({
  buttonId: null,
  category,
  endAt,
  expectMinutes: expect,
  id,
  isLogged: endAt !== null,
  label,
  limitMinutes: limit,
  messengersOnPurpose: false,
  startAt,
  taskId: null,
});

const withActivities = (activities: readonly Activity[]): CoreState => {
  const base = artboardState();
  return {
    ...base,
    time: { ...base.time, activities: Object.fromEntries(activities.map((a) => [a.id, a])) },
  };
};

const minutesBefore = (minutes: number): string =>
  new Date(Date.parse(NOW) - minutes * 60_000).toISOString();

describe("dayModel rows", () => {
  it("carries the Expect and the Limit, and hides a label that only repeats the category", () => {
    const state = withActivities([
      activity({
        category: "food",
        endAt: minutesBefore(100),
        expect: 30,
        id: "a1",
        label: "Food",
        startAt: minutesBefore(120),
      }),
      activity({
        category: "food",
        endAt: minutesBefore(80),
        id: "a2",
        label: "Еда",
        startAt: minutesBefore(90),
      }),
      activity({
        category: "sport",
        endAt: null,
        id: "a3",
        label: "Gym",
        limit: 90,
        startAt: minutesBefore(60),
      }),
    ]);
    const rows = dayModel(state, null, ctx()).entries.flatMap((entry) =>
      entry.kind === "activity" ? [entry.row] : [],
    );
    expect(
      rows.map((row) => [row.label, row.showsLabel, row.expectMinutes, row.limitMinutes]),
    ).toEqual([
      ["Food", false, 30, null],
      ["Еда", false, null, null],
      ["Gym", true, null, 90],
    ]);
  });
});

describe("trackedDates", () => {
  it("lists the days with time on them, on the account's calendar", () => {
    const state = withActivities([
      activity({
        category: "other",
        endAt: "2026-10-03T23:30:00.000Z",
        id: "a1",
        label: "Night",
        startAt: "2026-10-03T22:30:00.000Z",
      }),
      activity({
        category: "food",
        endAt: "2026-10-05T10:30:00.000Z",
        id: "a2",
        label: "Lunch",
        startAt: "2026-10-05T10:00:00.000Z",
      }),
    ]);
    expect(
      [...trackedDates(state, { ...ctx(), deviceTz: MOSCOW })].toSorted((a, b) =>
        a.localeCompare(b),
      ),
    ).toEqual(["2026-10-04", "2026-10-05"]);
  });
});

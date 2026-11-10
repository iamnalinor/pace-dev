import { describe, expect, it } from "vitest";

import type { Activity, TimeState } from "./model.ts";

import { yieldEvents, yieldsTo } from "./yield.ts";

const at = (clock: string): string => `2026-10-06T${clock}:00.000Z`;
const NOW = at("15:00");

const activity = (
  id: string,
  [startAt, endAt]: readonly [string, null | string],
  options: Partial<Activity> = {},
): Activity => ({
  buttonId: null,
  category: "study",
  endAt,
  expectMinutes: null,
  id,
  isAlongside: false,
  isLogged: true,
  label: id,
  originEventId: `e-${id}`,
  startAt,
  stillAt: null,
  taskId: null,
  ...options,
});

const timeOf = (...activities: readonly Activity[]): TimeState => ({
  activities: Object.fromEntries(activities.map((item) => [item.id, item])),
});

const span = (from: string, to: string) => ({ endAt: at(to), startAt: at(from) });

describe("yieldsTo: what a new past block takes from the blocks it lands on (owner, R27-05)", () => {
  it("names every main block it shares time with, live or logged, whole or in part", () => {
    const lecture = activity("lecture", [at("10:00"), at("11:00")]);
    const work = activity("work", [at("11:00"), null], { isLogged: false });
    const tea = activity("tea", [at("12:00"), at("12:10")]);
    const music = activity("music", [at("10:00"), at("13:00")], { isAlongside: true });
    expect(
      yieldsTo(timeOf(lecture, work, tea, music), span("10:30", "12:30"), NOW).map((item) => [
        item.activity.id,
        item.isWhole,
      ]),
    ).toEqual([
      ["lecture", false],
      ["work", false],
      ["tea", true],
    ]);
  });

  it("takes nothing from a block it only touches", () => {
    const lecture = activity("lecture", [at("10:00"), at("11:00")]);
    expect(yieldsTo(timeOf(lecture), span("11:00", "12:00"), NOW)).toEqual([]);
    expect(yieldsTo(timeOf(lecture), span("09:00", "10:00"), NOW)).toEqual([]);
  });
});

/** Ids `new-1`, `new-2`, … */
const ids = () => {
  let count = 0;
  return () => {
    count += 1;
    return `new-${String(count)}`;
  };
};

/** The events a new block `range` writes into `time`. */
const cutsOf = (time: TimeState, range: ReturnType<typeof span>) =>
  yieldEvents(yieldsTo(time, range, NOW), range, ids());

describe("yieldEvents: the cut of a logged neighbour as events (owner, R27-05)", () => {
  it("moves the end of a block it starts inside, the start of one it ends inside", () => {
    const before = activity("before", [at("09:00"), at("10:30")]);
    const after = activity("after", [at("11:30"), at("12:30")]);
    const time = timeOf(before, after);
    const range = span("10:00", "12:00");
    expect(cutsOf(time, range)).toEqual([
      { payload: { activityId: "before", endAt: at("10:00") }, type: "activity.adjusted" },
      { payload: { activityId: "after", startAt: at("12:00") }, type: "activity.adjusted" },
    ]);
  });

  it("splits a block it lies inside into two, the second a copy of the first", () => {
    const work = activity("work", [at("09:00"), at("13:00")], {
      category: "work",
      expectMinutes: 90,
      label: "Work",
      taskId: "t1",
    });
    const range = span("10:00", "11:00");
    expect(cutsOf(timeOf(work), range)).toEqual([
      { payload: { activityId: "work", endAt: at("10:00") }, type: "activity.adjusted" },
      {
        payload: {
          activityId: "new-1",
          category: "work",
          endAt: at("13:00"),
          expectMinutes: 90,
          label: "Work",
          startAt: at("11:00"),
          taskId: "t1",
        },
        type: "activity.logged",
      },
    ]);
  });

  it("revokes a block it covers whole, and leaves live blocks to the timeline", () => {
    const tea = activity("tea", [at("10:15"), at("10:30")]);
    const work = activity("work", [at("09:00"), null], { isLogged: false });
    const range = span("10:00", "11:00");
    expect(cutsOf(timeOf(tea, work), range)).toEqual([
      { payload: { targetId: "e-tea" }, type: "event.revoked" },
    ]);
  });
});

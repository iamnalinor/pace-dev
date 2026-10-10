import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ActivityCategorySchema } from "../events/payloads.ts";
import { TIME_BUTTONS, timeButton } from "./buttons.ts";
import { defaultsFor, paceStatus, remindAt } from "./expect.ts";
import { runningActivities, runningActivity, timeline } from "./timeline.ts";
import { act, start, T, timeOf } from "./tracking.fake.ts";

const DAY = { from: T("00:00"), to: "2026-10-08T00:00:00.000Z" };

const minuteArb = fc.integer({ max: 24 * 60 - 1, min: 0 });
const blockArb = fc.record({
  end: minuteArb,
  isAlongside: fc.boolean(),
  isLogged: fc.boolean(),
  start: minuteArb,
});

/** `hh:mm` of a minute of the day. */
const clock = (value: number): string =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

describe("the time reducer", () => {
  it("closes the running activity when the next one starts, and stops on stop", () => {
    const time = timeOf([
      start("09:00", { activityId: "a1", label: "Work" }),
      start("12:30", { activityId: "a2", label: "Lunch", category: "food" }),
      act("13:10", { payload: { activityId: "a2" }, type: "activity.stopped" }),
    ]);
    expect(time.activities["a1"]).toMatchObject({ endAt: T("12:30"), startAt: T("09:00") });
    expect(time.activities["a2"]).toMatchObject({ category: "food", endAt: T("13:10") });
  });

  it("runs an activity alongside the main one: neither closes the other", () => {
    const time = timeOf([
      start("09:00", { activityId: "a1", label: "Work" }),
      start("09:10", { activityId: "m1", alongside: true, category: "rest", label: "Music" }),
      start("09:30", { activityId: "a2", label: "Call" }),
    ]);
    expect(time.activities["a1"]).toMatchObject({ endAt: T("09:30"), isAlongside: false });
    expect(time.activities["m1"]).toMatchObject({ endAt: null, isAlongside: true });
    expect(runningActivity(time, T("10:00"))?.id).toBe("a2");
    expect(runningActivities(time, T("10:00")).map((activity) => activity.id)).toEqual([
      "a2",
      "m1",
    ]);
  });

  it("adjusts and relabels, and ignores the retired button events", () => {
    const time = timeOf([
      start("09:00", { activityId: "a1", label: "Work" }),
      act("10:00", {
        payload: { activityId: "a1", startAt: T("08:45") },
        type: "activity.adjusted",
      }),
      act("10:01", {
        payload: { activityId: "a1", category: "study", label: "Algebra" },
        type: "activity.labelled",
      }),
      act("10:02", {
        payload: {
          buttonId: "btn:read",
          category: "study",
          color: "violet",
          label: "Read",
          order: 0,
        },
        type: "activity.button.set",
      }),
    ]);
    expect(time.activities["a1"]).toMatchObject({
      category: "study",
      label: "Algebra",
      startAt: T("08:45"),
    });
    expect(Object.keys(time)).toEqual(["activities"]);
  });
});

describe("categories and buttons", () => {
  it("reads the retired errands category as chores", () => {
    expect(ActivityCategorySchema.parse("errands")).toBe("chores");
    expect(ActivityCategorySchema.parse("food")).toBe("food");
  });

  it("has four fixed buttons: calendar, rest (30 min), sport and chores with choices", () => {
    expect(TIME_BUTTONS.map((button) => button.id)).toEqual([
      "calendar",
      "rest",
      "sport",
      "chores",
    ]);
    const rest = timeButton("rest");
    expect(rest.choices).toEqual([
      expect.objectContaining({ category: "rest", expectMinutes: 30 }),
    ]);
    expect(timeButton("sport").choices.map((choice) => choice.expectMinutes)).toEqual([
      30, 60, 120, 180,
    ]);
    const chores = timeButton("chores").choices;
    expect(chores.map((choice) => choice.id)).toContain("chores:ready");
    expect(chores.find((choice) => choice.id === "chores:commute")).toMatchObject({
      category: "commute",
      expectMinutes: 45,
    });
    expect(timeButton("calendar").choices).toEqual([]);
  });
});

describe("timeline", () => {
  it("lays out a day with the running activity, totals and gaps", () => {
    const time = timeOf([
      start("08:00", { activityId: "a1", label: "Work" }),
      start("10:00", { activityId: "a2", label: "Lunch", category: "food" }),
    ]);
    const day = timeline(time, { ...DAY, now: T("10:40") });
    expect(
      day.segments.map((segment) => [segment.label, segment.minutes, segment.isRunning]),
    ).toEqual([
      ["Work", 120, false],
      ["Lunch", 40, true],
    ]);
    expect(day.totals).toEqual({ food: 40, work: 120 });
    expect(day.running?.activityId).toBe("a2");
    expect(day.gaps).toEqual([{ endAt: T("08:00"), minutes: 480, startAt: T("00:00") }]);
  });

  it("lets a logged block win over the live time it covers, splitting it", () => {
    const time = timeOf([
      start("08:00", { activityId: "a1", label: "Work" }),
      act("12:00", {
        payload: {
          activityId: "l1",
          category: "food",
          endAt: T("10:30"),
          label: "Breakfast",
          startAt: T("10:00"),
        },
        type: "activity.logged",
      }),
      act("12:00", { payload: { activityId: "a1" }, type: "activity.stopped" }),
    ]);
    const day = timeline(time, { ...DAY, now: T("13:00") });
    expect(day.segments.map((segment) => [segment.label, segment.startAt, segment.endAt])).toEqual([
      ["Work", T("08:00"), T("10:00")],
      ["Breakfast", T("10:00"), T("10:30")],
      ["Work", T("10:30"), T("12:00")],
    ]);
    expect(day.trackedMinutes).toBe(240);
    expect(day.gaps.at(-1)).toEqual({ endAt: T("13:00"), minutes: 60, startAt: T("12:00") });
  });

  it("lists an activity run alongside apart: it neither cuts the main line nor counts in totals", () => {
    const time = timeOf([
      start("08:00", { activityId: "a1", label: "Work" }),
      start("08:30", { activityId: "m1", alongside: true, category: "rest", label: "Music" }),
      act("09:00", { payload: { activityId: "m1" }, type: "activity.stopped" }),
    ]);
    const day = timeline(time, { ...DAY, now: T("10:00") });
    expect(day.segments.map((segment) => [segment.label, segment.minutes])).toEqual([
      ["Work", 120],
    ]);
    expect(day.alongside).toEqual([
      expect.objectContaining({ isAlongside: true, label: "Music", minutes: 30 }),
    ]);
    expect(day.totals).toEqual({ work: 120 });
  });

  it("never overlaps and never counts more than the range (property)", () => {
    fc.assert(
      fc.property(fc.array(blockArb, { maxLength: 12 }), (blocks) => {
        const events = blocks.map((block, index) =>
          block.isLogged && block.end > block.start
            ? act(clock(block.start), {
                payload: {
                  activityId: `l${String(index)}`,
                  category: "rest",
                  endAt: T(clock(block.end)),
                  label: "x",
                  startAt: T(clock(block.start)),
                },
                type: "activity.logged",
              })
            : start(clock(block.start), {
                activityId: `a${String(index)}`,
                label: "y",
                ...(block.isAlongside && { alongside: true }),
              }),
        );
        const day = timeline(timeOf(events), { ...DAY, now: "2026-10-08T00:00:00.000Z" });
        const isOrdered = day.segments.every(
          (segment, index) =>
            index === 0 || (day.segments[index - 1]?.endAt ?? "") <= segment.startAt,
        );
        expect(isOrdered).toBe(true);
        expect(day.trackedMinutes).toBeLessThanOrEqual(24 * 60);
      }),
    );
  });

  it("finds the running activity whatever the day", () => {
    const time = timeOf([start("08:00", { activityId: "a1", label: "Work" })]);
    expect(runningActivity(time, T("09:00"))?.id).toBe("a1");
    expect(runningActivity(timeOf([]), T("09:00"))).toBeNull();
  });
});

describe("expect", () => {
  it("asks whether it is still going once an activity runs twice as long as expected", () => {
    const time = timeOf([start("09:00", { activityId: "a1", expectMinutes: 30, label: "Rest" })]);
    const rest = time.activities["a1"];
    expect(paceStatus(rest, T("09:45"))).toBe("ok");
    expect(paceStatus(rest, T("10:00"))).toBe("long");
    expect(remindAt(rest)).toBe(T("10:00"));
    const unexpected = timeOf([start("09:00", { activityId: "a2", label: "x" })]);
    expect(remindAt(unexpected.activities["a2"])).toBeNull();
    expect(paceStatus(unexpected.activities["a2"], T("19:00"))).toBe("none");
  });

  it("'still going' moves the next ask as far again and keeps the Expect", () => {
    const time = timeOf([
      start("09:00", { activityId: "a1", expectMinutes: 30, label: "Rest" }),
      act("10:10", {
        payload: { activityId: "a1", stillAt: T("10:10") },
        type: "activity.labelled",
      }),
    ]);
    const rest = time.activities["a1"];
    expect(rest?.expectMinutes).toBe(30);
    expect(remindAt(rest)).toBe(T("11:20"));
    expect(paceStatus(rest, T("11:00"))).toBe("ok");
    expect(paceStatus(rest, T("11:20"))).toBe("long");
  });

  it("learns a label's typical length from three finished runs, else uses the category", () => {
    const runs = ["06:00", "07:00", "08:00"].flatMap((hhmm, index) => [
      start(hhmm, { activityId: `c${String(index)}`, category: "commute", label: "Commute" }),
      act(`0${String(6 + index)}:${["40", "50", "30"][index] ?? "00"}`, {
        payload: { activityId: `c${String(index)}` },
        type: "activity.stopped",
      }),
    ]);
    expect(defaultsFor(timeOf(runs), { category: "commute", label: "commute" })).toEqual({
      expectMinutes: 40,
      samples: 3,
      source: "history",
    });
    expect(defaultsFor(timeOf([]), { category: "chores", label: "Tidy up" })).toEqual({
      expectMinutes: null,
      samples: 0,
      source: "category",
    });
  });
});

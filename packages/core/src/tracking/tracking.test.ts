import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DEFAULT_BUTTONS, effectiveButtons } from "./buttons.ts";
import { defaultsFor, paceStatus } from "./expect-limit.ts";
import { runningActivity, timeline } from "./timeline.ts";
import { act, start, T, timeOf } from "./tracking.fake.ts";

const DAY = { from: T("00:00"), to: "2026-10-08T00:00:00.000Z" };

describe("the time reducer", () => {
  it("closes the running activity when the next one starts, and stops on stop", () => {
    const time = timeOf([
      start("09:00", "a1", "Work"),
      start("12:30", "a2", "Lunch", { category: "food" }),
      act("13:10", { payload: { activityId: "a2" }, type: "activity.stopped" }),
    ]);
    expect(time.activities["a1"]).toMatchObject({ endAt: T("12:30"), startAt: T("09:00") });
    expect(time.activities["a2"]).toMatchObject({ category: "food", endAt: T("13:10") });
  });

  it("adjusts, relabels and keeps buttons once the bar is edited", () => {
    const time = timeOf([
      start("09:00", "a1", "Work"),
      act("10:00", { payload: { activityId: "a1", startAt: T("08:45") }, type: "activity.adjusted" }),
      act("10:01", {
        payload: { activityId: "a1", category: "study", label: "Algebra" },
        type: "activity.labelled",
      }),
      act("10:02", {
        payload: { buttonId: "btn:read", category: "study", color: "violet", label: "Read", order: 0 },
        type: "activity.button.set",
      }),
    ]);
    expect(time.activities["a1"]).toMatchObject({ category: "study", label: "Algebra", startAt: T("08:45") });
    expect(effectiveButtons(time).map((button) => button.label)).toEqual(["Read"]);
    expect(effectiveButtons(timeOf([]))).toEqual(DEFAULT_BUTTONS);
  });
});

describe("timeline", () => {
  it("lays out a day with the running activity, totals and gaps", () => {
    const time = timeOf([start("08:00", "a1", "Work"), start("10:00", "a2", "Lunch", { category: "food" })]);
    const day = timeline(time, { ...DAY, now: T("10:40") });
    expect(day.segments.map((segment) => [segment.label, segment.minutes, segment.isRunning])).toEqual([
      ["Work", 120, false],
      ["Lunch", 40, true],
    ]);
    expect(day.totals).toEqual({ food: 40, work: 120 });
    expect(day.running?.activityId).toBe("a2");
    expect(day.gaps).toEqual([{ endAt: T("08:00"), minutes: 480, startAt: T("00:00") }]);
  });

  it("lets a logged block win over the live time it covers, splitting it", () => {
    const time = timeOf([
      start("08:00", "a1", "Work"),
      act("12:00", {
        payload: { activityId: "l1", category: "food", endAt: T("10:30"), label: "Breakfast", startAt: T("10:00") },
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

  it("never overlaps and never counts more than the range (property)", () => {
    const minute = fc.integer({ max: 24 * 60 - 1, min: 0 });
    const clock = (value: number): string =>
      `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    fc.assert(
      fc.property(
        fc.array(fc.record({ end: minute, isLogged: fc.boolean(), start: minute }), { maxLength: 12 }),
        (blocks) => {
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
              : start(clock(block.start), `a${String(index)}`, "y"),
          );
          const day = timeline(timeOf(events), { ...DAY, now: "2026-10-08T00:00:00.000Z" });
          const ordered = day.segments.every(
            (segment, index) => index === 0 || (day.segments[index - 1]?.endAt ?? "") <= segment.startAt,
          );
          return ordered && day.trackedMinutes <= 24 * 60;
        },
      ),
    );
  });

  it("finds the running activity whatever the day", () => {
    const time = timeOf([start("08:00", "a1", "Work")]);
    expect(runningActivity(time, T("09:00"))?.id).toBe("a1");
    expect(runningActivity(timeOf([]), T("09:00"))).toBeNull();
  });
});

describe("expect and limit", () => {
  it("rates a running activity against its expect and limit", () => {
    expect(paceStatus(20, { expectMinutes: 30, limitMinutes: null })).toBe("ok");
    expect(paceStatus(35, { expectMinutes: 30, limitMinutes: null })).toBe("over-expect");
    expect(paceStatus(52, { expectMinutes: null, limitMinutes: 60 })).toBe("near-limit");
    expect(paceStatus(60, { expectMinutes: null, limitMinutes: 60 })).toBe("over-limit");
    expect(paceStatus(10, { expectMinutes: null, limitMinutes: null })).toBe("none");
  });

  it("learns a label's typical length from three finished runs, else uses the category", () => {
    const runs = ["06:00", "07:00", "08:00"].flatMap((hhmm, index) => [
      start(hhmm, `c${String(index)}`, "Commute", { category: "commute" }),
      act(`0${String(6 + index)}:${["40", "50", "30"][index] ?? "00"}`, {
        payload: { activityId: `c${String(index)}` },
        type: "activity.stopped",
      }),
    ]);
    expect(defaultsFor(timeOf(runs), { category: "commute", label: "commute" })).toEqual({
      expectMinutes: 40,
      limitMinutes: null,
      samples: 3,
      source: "history",
    });
    expect(defaultsFor(timeOf([]), { category: "hygiene", label: "Shower" })).toEqual({
      expectMinutes: null,
      limitMinutes: 60,
      samples: 0,
      source: "category",
    });
  });
});

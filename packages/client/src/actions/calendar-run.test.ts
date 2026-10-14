import { describe, expect, it } from "vitest";

import { NOW } from "@pace/core/testing";

import { activityLabel, isCalendarRun } from "./calendar-run.ts";

const at = (minutes: number): string => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

/** A 90-minute lecture starting ten minutes after now. */
const lecture = { endAt: at(100), startAt: at(10), title: "Lecture" };

const run = (startIn: number, label = lecture.title) => ({ label, startAt: at(startIn) });

describe("an occurrence's own run", () => {
  it("is under its title, begun from fifteen minutes before its start until its end", () => {
    // Attended ten minutes early it runs from the tap: answered, though not on the event's time yet.
    expect(isCalendarRun(lecture, run(0))).toBe(true);
    expect(isCalendarRun(lecture, run(-5))).toBe(true);
    expect(isCalendarRun(lecture, run(40))).toBe(true);
    expect(isCalendarRun(lecture, run(-6))).toBe(false);
    expect(isCalendarRun(lecture, run(100))).toBe(false);
    expect(isCalendarRun(lecture, run(0, "Something else"))).toBe(false);
  });

  it("is not a run of the same title left open from yesterday, nor the one just before", () => {
    expect(isCalendarRun(lecture, run(-24 * 60))).toBe(false);
    // Back to back: the 08:40–10:10 lecture's run is not the 10:10 one's.
    expect(isCalendarRun(lecture, run(-80))).toBe(false);
  });

  it("matches a title longer than a label as the activity stores it", () => {
    const long = { ...lecture, title: `  Lecture ${"x".repeat(100)}` };
    const stored = activityLabel(long.title);
    expect(stored).toHaveLength(80);
    expect(isCalendarRun(long, run(0, stored))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { activityFormOf, typeTime } from "./time-forms.ts";

/** `HH:mm` of a UTC instant, standing in for a platform's time input. */
const clock = (iso: string): string => iso.slice(11, 16);

describe("time forms", () => {
  it("opens the Day sheet on the block's own fields", () => {
    expect(
      activityFormOf(
        {
          activityId: "a1",
          category: "food",
          endAt: null,
          expectMinutes: 25,
          kind: "edit",
          label: "Lunch",
          startAt: "2026-10-06T12:30:00.000Z",
          taskId: "t1",
        },
        clock,
      ),
    ).toEqual({
      category: "food",
      expectMinutes: 25,
      from: "12:30",
      fromDay: null,
      label: "Lunch",
      taskId: "t1",
      to: "",
      toDay: null,
    });
    expect(
      activityFormOf(
        { endAt: "2026-10-06T10:00:00.000Z", kind: "log", startAt: "2026-10-06T09:00:00.000Z" },
        clock,
      ),
    ).toEqual({
      category: "other",
      expectMinutes: null,
      from: "09:00",
      fromDay: null,
      label: "",
      taskId: null,
      to: "10:00",
      toDay: null,
    });
  });
});

describe("typeTime", () => {
  it("puts the colon in and says when the minutes are in", () => {
    expect(typeTime("14")).toEqual({ isComplete: false, text: "14" });
    expect(typeTime("140")).toEqual({ isComplete: false, text: "14:0" });
    expect(typeTime("1405")).toEqual({ isComplete: true, text: "14:05" });
    expect(typeTime("14:05")).toEqual({ isComplete: true, text: "14:05" });
    expect(typeTime("140512")).toEqual({ isComplete: true, text: "14:05" });
  });

  it("reads a first digit above 2 as a whole hour and refuses impossible times", () => {
    expect(typeTime("9")).toEqual({ isComplete: false, text: "09" });
    expect(typeTime("2575")).toEqual({ isComplete: false, text: "25:75" });
  });

  it("reads the hour before a separator as typed, whole or pasted (QA round 25 R25-04)", () => {
    for (const raw of ["9:30", "09:30", "9.30", "9 30", "9h30", "9,30"]) {
      expect(typeTime(raw)).toEqual({ isComplete: true, text: "09:30" });
    }
    // Typed key by key: "1", then the colon, then the minutes.
    expect(typeTime("1:")).toEqual({ isComplete: false, text: "01:" });
    expect(typeTime("01:3")).toEqual({ isComplete: false, text: "01:3" });
    expect(typeTime("01:30")).toEqual({ isComplete: true, text: "01:30" });
    expect(typeTime("14:0")).toEqual({ isComplete: false, text: "14:0" });
    expect(typeTime("25:00")).toEqual({ isComplete: false, text: "25:00" });
  });
});

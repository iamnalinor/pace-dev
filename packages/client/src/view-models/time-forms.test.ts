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
          kind: "edit",
          label: "Lunch",
          startAt: "2026-10-06T12:30:00.000Z",
        },
        clock,
      ),
    ).toEqual({ category: "food", from: "12:30", label: "Lunch", to: "" });
    expect(
      activityFormOf(
        { endAt: "2026-10-06T10:00:00.000Z", kind: "log", startAt: "2026-10-06T09:00:00.000Z" },
        clock,
      ),
    ).toEqual({ category: "other", from: "09:00", label: "", to: "10:00" });
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
});

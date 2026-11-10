import { describe, expect, it } from "vitest";

import { activityFormOf, readTime, typeTime } from "./time-forms.ts";

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

  it("keeps a deletion inside a filled value as typed, never a complete wrong time (QA-25 review I1)", () => {
    // «09:30», the caret after the 9, Backspace: «0:30» is half an hour, not 00:30.
    expect(typeTime("0:30", "09:30")).toEqual({ isComplete: false, text: "0:30" });
    expect(typeTime("1:30", "19:30")).toEqual({ isComplete: false, text: "1:30" });
    expect(typeTime("9:30", "09:30")).toEqual({ isComplete: false, text: "9:30" });
    expect(typeTime("9", "09")).toEqual({ isComplete: false, text: "9" });
    // Both hour digits gone, then "1": the second digit is still to come.
    expect(typeTime("1:30", ":30")).toEqual({ isComplete: false, text: "1:30" });
    expect(typeTime("10:30", "1:30")).toEqual({ isComplete: true, text: "10:30" });
    // A minute digit deleted, then retyped.
    expect(typeTime("09:3", "09:30")).toEqual({ isComplete: false, text: "09:3" });
    expect(typeTime("09:45", "09:4")).toEqual({ isComplete: true, text: "09:45" });
    // Typed forward key by key, and a paste over the whole field, still fill the hour out.
    expect(typeTime("1:", "1")).toEqual({ isComplete: false, text: "01:" });
    expect(typeTime("9:30", "")).toEqual({ isComplete: true, text: "09:30" });
    // Read whole, the way the field reads it when left: the hour is filled out.
    expect(typeTime("9:30")).toEqual({ isComplete: true, text: "09:30" });
  });

  it("reads «930» the same typed or pasted, and refuses text after the minutes (QA-25 review M4, R26-05)", () => {
    expect(typeTime("930")).toEqual({ isComplete: true, text: "09:30" });
    expect(typeTime("930", "")).toEqual({ isComplete: true, text: "09:30" });
    // Pasted over a filled field.
    expect(typeTime("930", "09:30")).toEqual({ isComplete: true, text: "09:30" });
    // One key typed over a selected hour: kept as typed until the second digit.
    expect(typeTime("1:30", "09:30")).toEqual({ isComplete: false, text: "1:30" });
    expect(typeTime("093", "09")).toEqual({ isComplete: false, text: "09:3" });
    for (const raw of ["9:30 PM", "9:30pm", "12:345", "140512", "1:2:3"]) {
      expect(typeTime(raw).isComplete).toBe(false);
    }
  });

  it("never takes a second separator typed key by key (QA round 27 R27-04)", () => {
    expect(typeTime("09:9:", "09:9")).toEqual({ isComplete: false, text: "09:9" });
    expect(typeTime("09:30:", "09:30")).toEqual({ isComplete: true, text: "09:30" });
    let text = "";
    for (const key of "99:99") {
      text = typeTime(`${text}${key}`, text).text;
      expect(text.split(":").length).toBeLessThanOrEqual(2);
    }
  });
});

describe("readTime: a field read whole when it is left or saved", () => {
  it("reads an hour typed alone as that hour sharp (QA round 27 R27-04)", () => {
    for (const [raw, text] of [
      ["7", "07:00"],
      ["07", "07:00"],
      ["7:", "07:00"],
      ["14", "14:00"],
      ["0", "00:00"],
    ] as const) {
      expect(readTime(raw)).toEqual({ isComplete: true, text });
    }
    expect(readTime("24").isComplete).toBe(false);
    expect(readTime("1430")).toEqual({ isComplete: true, text: "14:30" });
    expect(readTime("14:3").isComplete).toBe(false);
  });
});

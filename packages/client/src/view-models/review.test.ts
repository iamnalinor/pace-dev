import { describe, expect, it } from "vitest";

import { artboardState, CALC_HW5_DUE, CALC_HW5_ID, ctx, INBOX_CABLE_ID } from "@pace/core/testing";

import { reviewViewModel } from "./review.ts";

describe("reviewViewModel", () => {
  it("lists what needs sorting with the task title, the age and the action keys", () => {
    const review = reviewViewModel(artboardState(), ctx());
    expect(review.count).toBe(2);
    expect(review.items.map((entry) => [entry.kind, entry.taskId, entry.title])).toEqual([
      ["unsorted-too-long", INBOX_CABLE_ID, "кабель usb-c"],
      ["deadline-passed", CALC_HW5_ID, "Calculus HW 5"],
    ]);
    expect(review.items[1]).toMatchObject({
      actions: ["mark-done", "cancel", "skip", "keep-open"],
      since: CALC_HW5_DUE,
      sinceMinutes: 15 * 60 + 1,
    });
    expect(review.items[1]?.item.actions.map((action) => action.key)).toEqual(
      review.items[1]?.actions,
    );
  });
});

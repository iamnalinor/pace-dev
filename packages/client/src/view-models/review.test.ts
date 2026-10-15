import { describe, expect, it } from "vitest";

import type { CoreState } from "@pace/core";

import { artboardState, CALC_HW5_DUE, CALC_HW5_ID, ctx, INBOX_CABLE_ID } from "@pace/core/testing";

import { inboxViewModel } from "./inbox.ts";
import { reviewDecisions, reviewViewModel, waitingCount } from "./review.ts";

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

/** The Inbox badge's figure, as the badge and the Inbox screen both read it (bug class 4). */
const waitingIn = (state: CoreState): number =>
  waitingCount(inboxViewModel(state, ctx()), reviewViewModel(state, ctx()));

describe("waitingCount", () => {
  it("is the captures plus the decisions, a capture waiting too long counted once", () => {
    const state = artboardState();
    // Three captures (one too long, whose review row is its own card) and a passed deadline.
    const review = reviewViewModel(state, ctx());
    expect(reviewDecisions(review).map((row) => row.kind)).toEqual(["deadline-passed"]);
    expect(waitingIn(state)).toBe(4);
  });

  it("is 0 with nothing open, and the decisions alone without captures", () => {
    const empty = artboardState();
    const nothing: CoreState = { ...empty, tasks: { ...empty.tasks, byId: {} } };
    expect(waitingIn(nothing)).toBe(0);
    const sorted = Object.entries(empty.tasks.byId).filter(([, task]) => task.presetId !== "inbox");
    const decisionsOnly: CoreState = {
      ...empty,
      tasks: {
        ...empty.tasks,
        byId: Object.fromEntries(sorted),
      },
    };
    expect(waitingIn(decisionsOnly)).toBe(1);
  });
});

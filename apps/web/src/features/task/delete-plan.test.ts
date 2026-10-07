import { describe, expect, it } from "vitest";

import { artboardEvents, BOOKS_ID, HW_ID } from "@pace/core/testing";

import { deletePlan } from "./delete-plan.ts";

describe("deletePlan", () => {
  const events = artboardEvents();

  it("revokes the creation of a task nothing else happened to", () => {
    const created = events.find(
      (event) => event.type === "task.created" && event.payload.taskId === BOOKS_ID,
    );
    expect(deletePlan(events, BOOKS_ID)).toEqual({ eventId: created?.id, kind: "revoke" });
  });

  it("closes a task with a history as cancelled instead", () => {
    expect(deletePlan(events, HW_ID)).toEqual({ kind: "cancel" });
    expect(deletePlan(events, "t-nope")).toEqual({ kind: "cancel" });
  });
});

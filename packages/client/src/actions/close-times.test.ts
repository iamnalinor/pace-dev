import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addMinutesIso } from "@pace/core";
import { MOSCOW, NOW } from "@pace/core/testing";

import { quickTimes } from "../clock.ts";
import { setupActions, unwrap } from "./fixture.fake.ts";

/*
Bug class 1 (one decision in two places) and 9 (time boundaries): the close sheet offers its
pills ("now", "an hour ago", "yesterday evening", "at the deadline"), and the close refuses an
instant before the task was made or ahead of now. Every pill offered must be one the close takes.
*/

/** A task made `createdMinutes` from now (≤ 0), due `dueMinutes` from now (or not due). */
const taskMade = async (createdMinutes: number, dueMinutes: null | number) => {
  const world = await setupActions([]);
  world.setNow(addMinutesIso(NOW, createdMinutes));
  unwrap(
    await world.actions.createTask({
      presetId: "personal",
      title: "Report",
      ...(dueMinutes !== null && { dueAt: addMinutesIso(NOW, dueMinutes), dueTz: MOSCOW }),
    }),
  );
  world.setNow(NOW);
  const [task = null] = Object.values(world.state.store.getState().tasks.byId);
  return { task, world };
};

/** Whether closing the task at every pill offered for it is accepted (each on a fresh world). */
const isEveryPillAccepted = async ([created, due]: readonly [number, null | number]) => {
  const { task } = await taskMade(created, due);
  if (task === null) {
    return false;
  }
  const pills = quickTimes({ deviceTz: MOSCOW, now: () => NOW }, task);
  for (const pill of pills) {
    const { task: fresh, world } = await taskMade(created, due);
    const result = await world.actions.closeTask({
      at: pill.at,
      outcome: "done",
      taskId: fresh?.id ?? "",
    });
    if (!result.ok) {
      return false;
    }
  }
  return pills.some((pill) => pill.key === "now");
};

describe("the close sheet's pills", () => {
  it("are all times the close accepts, however old the task and wherever its deadline", async () => {
    const offsets = fc.tuple(
      fc.integer({ max: 0, min: -3 * 24 * 60 }),
      fc.option(fc.integer({ max: 3 * 24 * 60, min: -3 * 24 * 60 })),
    );
    await fc.assert(fc.asyncProperty(offsets, isEveryPillAccepted), { numRuns: 60 });
    // Made ten minutes ago, due tomorrow: no "an hour ago", "yesterday evening" or "at the deadline".
    expect(await isEveryPillAccepted([-10, 24 * 60])).toBe(true);
  });

  it("still offers the deadline once it has passed, and an hour ago for a task older than that", async () => {
    const { task } = await taskMade(-3 * 60, -30);
    const keys = quickTimes({ deviceTz: MOSCOW, now: () => NOW }, task).map((pill) => pill.key);
    expect(keys).toEqual(["now", "hour-ago", "at-deadline"]);
  });
});

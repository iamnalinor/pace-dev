import { describe, expect, it } from "vitest";

import { RFC_ID, TRK_ID } from "@pace/core/testing";

import { createHeldEventStore } from "../held-event-store.fake.ts";
import { type ActionsWorld, setupActions } from "./fixture.fake.ts";

/** Lets every queued microtask and timer run (a held write stays held). */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

const track = <T>(promise: Promise<T>): (() => T | undefined) => {
  let value: T | undefined;
  void (async () => {
    value = await promise;
  })();
  return () => value;
};

const heldWorld = async (): Promise<{
  readonly world: ActionsWorld;
  readonly held: ReturnType<typeof createHeldEventStore>;
}> => {
  const held = createHeldEventStore();
  const world = await setupActions(undefined, held.store);
  held.hold();
  return { held, world };
};

const closedOf = (world: ActionsWorld, taskId: string): unknown =>
  world.state.store.getState().tasks.byId[taskId]?.closed ?? null;

describe("an action's result shows before its local write (bug-lessons 3 and 57)", () => {
  it("closes the task on screen while the write is pending, then answers ok", async () => {
    const { held, world } = await heldWorld();
    const answer = track(world.actions.closeTask({ outcome: "done", taskId: TRK_ID }));
    await flush();
    expect(closedOf(world, TRK_ID)).not.toBeNull();
    expect(answer()).toBeUndefined();

    await held.writes[0]?.resolve();
    await flush();
    expect(answer()).toMatchObject({ ok: true });
    expect(closedOf(world, TRK_ID)).not.toBeNull();
  });

  it("reopens the task on screen and answers persist_failed when the write is refused", async () => {
    const { held, world } = await heldWorld();
    const answer = track(world.actions.closeTask({ outcome: "done", taskId: TRK_ID }));
    await flush();
    expect(closedOf(world, TRK_ID)).not.toBeNull();

    held.writes[0]?.reject();
    await flush();
    expect(answer()).toEqual({ error: "persist_failed", ok: false });
    expect(closedOf(world, TRK_ID)).toBeNull();
  });

  it("refuses a double tap at once from the state, without waiting for the disk", async () => {
    const { held, world } = await heldWorld();
    const first = track(world.actions.closeTask({ outcome: "done", taskId: TRK_ID }));
    const second = track(world.actions.closeTask({ outcome: "done", taskId: TRK_ID }));
    await flush();
    expect(second()).toEqual({ error: "action/nothing-to-do", ok: false });
    expect(first()).toBeUndefined();
    expect(held.writes).toHaveLength(1);
    await held.writes[0]?.resolve();
    await flush();
    expect(first()).toMatchObject({ ok: true });
  });

  it("shows a second close while the first is pending, and keeps it when only the first is refused", async () => {
    const { held, world } = await heldWorld();
    const first = track(world.actions.closeTask({ outcome: "done", taskId: TRK_ID }));
    const second = track(world.actions.closeTask({ outcome: "done", taskId: RFC_ID }));
    await flush();
    expect(closedOf(world, TRK_ID)).not.toBeNull();
    expect(closedOf(world, RFC_ID)).not.toBeNull();

    held.writes[0]?.reject();
    await flush();
    await held.writes[1]?.resolve();
    await flush();
    expect(first()).toEqual({ error: "persist_failed", ok: false });
    expect(second()).toMatchObject({ ok: true });
    expect(closedOf(world, TRK_ID)).toBeNull();
    expect(closedOf(world, RFC_ID)).not.toBeNull();
  });
});

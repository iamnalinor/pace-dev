import { describe, expect, it } from "vitest";

import { autoOutcomeId, type Event } from "@pace/core";
import { artboardEvents, CALC_HW5_ID, HW_ID, INBOX_SYNC_ID, NOW, TRK_ID } from "@pace/core/testing";

import type { Actions } from "./actions.ts";
import type { ActionResult } from "./deps.ts";

import { type ActionsWorld, setupActions, setupCheckpointActions, unwrap } from "./fixture.fake.ts";

/*
Every action that writes a correction (`event.revoked`, `event.amended`), run on a checkpoint copy
whose base holds its target (PR 55 follow-up review, items 1 and 2; bug-lessons 360). A correction
always needs the source, so each loads the complete history once and then succeeds as it does on a
full copy. `undoArchive` staged its revocation past the loader; `restorePreset` read the log before
the wait (class 118). Both answered `action/nothing-to-do` here and loaded nothing.
*/

const HOUR = 60 * 60 * 1000;
const HOUR_AGO = new Date(Date.parse(NOW) - HOUR).toISOString();
const TWO_HOURS_AGO = new Date(Date.parse(NOW) - 2 * HOUR).toISOString();

/** An automatic miss an older version wrote, for the review actions that correct it. */
const oldMiss: Event = {
  deviceId: "server",
  id: autoOutcomeId(CALC_HW5_ID, "missed"),
  occurredAt: HOUR_AGO,
  payload: { outcome: "cancelled_missed", taskId: CALC_HW5_ID },
  precision: "exact",
  recordedAt: HOUR_AGO,
  source: "system",
  type: "task.closed",
};

type Run = (actions: Actions) => ActionResult;

type Case = {
  readonly name: string;
  /** Builds the log on a full copy, then answers the action to run on the checkpoint copy. */
  readonly prepare: (world: ActionsWorld) => Promise<Run>;
};

const eventOf = (events: readonly Event[]): Event => {
  const [event] = events;
  if (event === undefined) {
    throw new Error("no event written");
  }
  return event;
};

const restoreAlgebra: Run = async (actions) => await actions.restorePreset("hw.algebra");
const undoLast: Run = async (actions) => await actions.undoLast();
const deleteTrk: Run = async (actions) => await actions.deleteTask(TRK_ID);
const discardSync: Run = async (actions) => await actions.discardInbox(INBOX_SYNC_ID);
const unmarkS5: Run = async (actions) => await actions.unmarkDone(HW_ID, "s5");
const confirmMiss: Run = async (actions) => await actions.confirmAutoOutcome(CALC_HW5_ID);
const undoMiss: Run = async (actions) => await actions.undoAutoOutcome(CALC_HW5_ID);
const startDaily: Run = async (actions) =>
  await actions.startSeriesForTask(TRK_ID, { kind: "daily" });

/** A case whose action needs nothing but the artboard's log. */
const asIs =
  (run: Run): Case["prepare"] =>
  async () =>
    run;

const CASES: readonly Case[] = [
  {
    name: "undoArchive",
    prepare: async (world) => {
      const created = eventOf(
        unwrap(await world.actions.createProject({ color: "blue", name: "Infra" })),
      );
      const projectId = created.type === "project.created" ? created.payload.projectId : "";
      const archived = eventOf(
        unwrap(await world.actions.updateProject(projectId, { archived: true })),
      );
      return async (actions) => await actions.undoArchive(projectId, archived.id);
    },
  },
  {
    name: "restorePreset",
    prepare: async (world) => {
      unwrap(await world.actions.archivePreset("hw.algebra"));
      return restoreAlgebra;
    },
  },
  {
    name: "revoke",
    prepare: async (world) => {
      const event = eventOf(unwrap(await world.actions.updateTask(TRK_ID, { title: "Renamed" })));
      return async (actions) => await actions.revoke(event.id);
    },
  },
  {
    name: "revokeAll",
    prepare: async (world) => {
      const event = eventOf(unwrap(await world.actions.updateTask(TRK_ID, { title: "Renamed" })));
      return async (actions) => await actions.revokeAll([event.id]);
    },
  },
  {
    name: "undoLast",
    prepare: async (world) => {
      unwrap(await world.actions.updateTask(TRK_ID, { title: "Renamed" }));
      return undoLast;
    },
  },
  { name: "deleteTask", prepare: asIs(deleteTrk) },
  { name: "discardInbox", prepare: asIs(discardSync) },
  {
    name: "unmarkDone",
    prepare: async (world) => {
      unwrap(await world.actions.markDone(HW_ID, "s5", { at: HOUR_AGO }));
      return unmarkS5;
    },
  },
  {
    name: "deleteActivity",
    prepare: async (world) => {
      const logged = eventOf(
        unwrap(
          await world.actions.logPast({
            category: "study",
            endAt: HOUR_AGO,
            label: "Lecture",
            startAt: TWO_HOURS_AGO,
          }),
        ),
      );
      const activityId = logged.type === "activity.logged" ? logged.payload.activityId : "";
      return async (actions) => await actions.deleteActivity(activityId);
    },
  },
  { name: "confirmAutoOutcome", prepare: asIs(confirmMiss) },
  { name: "undoAutoOutcome", prepare: asIs(undoMiss) },
  { name: "startSeriesForTask", prepare: asIs(startDaily) },
];

describe.each(CASES)("$name on a checkpoint copy", ({ prepare }) => {
  it("loads the complete history once, then writes its correction", async () => {
    const full = await setupActions([...artboardEvents(), oldMiss]);
    await full.actions.ensureInstances();
    const run = await prepare(full);
    // The same log twice: one copy loads its history first, as a reference for what is written.
    const onFull = await setupCheckpointActions(full.state.store.getState().log, NOW);
    const copy = await setupCheckpointActions(full.state.store.getState().log, NOW);
    expect(copy.state.store.getState().historyCoverage).toBe("checkpoint");

    const written = await run(copy.actions);

    expect(written).toMatchObject({ ok: true });
    expect(copy.loads()).toBe(1);
    expect(copy.state.store.getState().historyCoverage).toBe("full");
    // The same action on the copy whose history is loaded first writes the same kinds of events.
    unwrap(await onFull.state.ensureHistory());
    const reference = unwrap(await run(onFull.actions));
    expect(unwrap(written).map((event) => event.type)).toEqual(
      reference.map((event) => event.type),
    );
  });
});

describe("confirming an automatic outcome across the history's wait (class 118 sweep)", () => {
  it("writes one amendment for two presses at once: the second is asked again after the wait", async () => {
    const full = await setupActions([...artboardEvents(), oldMiss]);
    await full.actions.ensureInstances();
    const copy = await setupCheckpointActions(full.state.store.getState().log, NOW);
    const presses = await Promise.all([confirmMiss(copy.actions), confirmMiss(copy.actions)]);
    expect(presses.map((result) => result.ok)).toEqual([true, false]);
    expect(presses[1]).toEqual({ error: "action/nothing-to-do", ok: false });
  });
});

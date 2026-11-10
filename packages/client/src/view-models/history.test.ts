import { describe, expect, it } from "vitest";

import { addMinutesIso } from "@pace/core";
import { CALC_HW5_ID, HW_ID, MOSCOW, NOW, sheetId, TRK_ID } from "@pace/core/testing";

import { setupActions, unwrap } from "../actions/fixture.fake.ts";
import { historyViewModel } from "./history.ts";

describe("historyViewModel", () => {
  it("names how a task was closed: done, cancelled or skipped (QA round 20 L8)", async () => {
    const world = await setupActions();
    const [skipped] = unwrap(await world.actions.closeTask({ outcome: "skipped", taskId: TRK_ID }));
    const history = historyViewModel(world.state.store.getState(), {
      atIso: NOW,
      deviceTz: MOSCOW,
    });
    expect(history.events.find((entry) => entry.id === skipped?.id)?.labelKey).toBe(
      "event.task.skipped",
    );
  });

  it("shows the revocations one Undo wrote together as one row that undoes them all (QA round 26 R26-10)", async () => {
    const world = await setupActions();
    const [done] = unwrap(await world.actions.closeTask({ outcome: "done", taskId: TRK_ID }));
    const [started] = unwrap(await world.actions.startChoice("rest"));
    if (done === undefined || started === undefined) {
      throw new Error("written");
    }
    const batch = unwrap(await world.actions.revokeAll([done.id, started.id]));
    const history = historyViewModel(world.state.store.getState(), {
      atIso: NOW,
      deviceTz: MOSCOW,
    });
    const rows = history.events.filter((entry) => entry.type === "event.revoked");
    expect(rows).toHaveLength(1);
    expect(new Set(rows[0]?.ids)).toEqual(new Set(batch.map((event) => event.id)));
    // A revocation written alone, later, stays a row of its own.
    world.setNow(addMinutesIso(NOW, 1));
    unwrap(await world.actions.revoke(batch[0]?.id ?? ""));
    const after = historyViewModel(world.state.store.getState(), { atIso: NOW, deviceTz: MOSCOW });
    expect(after.events.filter((entry) => entry.type === "event.revoked")).toHaveLength(2);
  });

  it("names the activity an activity event is about", async () => {
    const world = await setupActions();
    const [started] = unwrap(await world.actions.startChoice("rest"));
    const history = historyViewModel(world.state.store.getState(), {
      atIso: NOW,
      deviceTz: MOSCOW,
    });
    expect(history.events.find((entry) => entry.id === started?.id)).toMatchObject({
      taskId: null,
      taskTitle: "Rest",
      type: "activity.started",
    });
  });

  it("names the preset a preset event is about, as it is called now (QA round 23 R23-07)", async () => {
    const world = await setupActions([]);
    const [created] = unwrap(
      await world.actions.createPreset({ definition: {}, extends: "hw", id: "gym", name: "Gym" }),
    );
    const [renamed] = unwrap(
      await world.actions.updatePreset({ definition: {}, extends: "hw", id: "gym", name: "Swim" }),
    );
    const [archived] = unwrap(await world.actions.archivePreset("gym"));
    const named = (id: string | undefined) =>
      historyViewModel(world.state.store.getState(), { atIso: NOW, deviceTz: MOSCOW }).events.find(
        (entry) => entry.id === id,
      )?.taskTitle;
    expect([named(created?.id), named(renamed?.id), named(archived?.id)]).toEqual([
      "Swim",
      "Swim",
      "Swim",
    ]);
  });

  it("shows the board at an instant and the log newest first with what can be undone", async () => {
    const world = await setupActions();
    const [solved] = unwrap(await world.actions.markDone(HW_ID, "s5"));
    const [revoked] = unwrap(await world.actions.undoLast());
    const history = historyViewModel(world.state.store.getState(), {
      atIso: NOW,
      deviceTz: MOSCOW,
    });

    expect(history.at).toBe(NOW);
    expect(history.board.rows.map((row) => row.id)).toContain(CALC_HW5_ID);
    const monday = historyViewModel(world.state.store.getState(), {
      atIso: "2026-10-05T08:00:00.000Z",
      deviceTz: MOSCOW,
    });
    expect(monday.board.rows.map((row) => row.id)).not.toContain(TRK_ID);

    // The fixture holds a Wednesday event, so "newest" is read by id, not by position.
    const latest = history.events.find((entry) => entry.id === revoked?.id);
    const previous = history.events.find((entry) => entry.id === solved?.id);
    expect(latest).toMatchObject({
      id: revoked?.id,
      revocable: false,
      revokedBy: null,
      source: "web",
      taskId: HW_ID,
      taskTitle: "Algebra HW 6",
      type: "event.revoked",
    });
    expect(previous).toMatchObject({
      id: solved?.id,
      revocable: false,
      revokedBy: revoked?.id,
      taskTitle: "Algebra HW 6",
      type: "task.subtask.solved",
    });
    expect(history.events.at(-1)).toMatchObject({
      revocable: true,
      revokedBy: null,
      taskId: sheetId(1),
      taskTitle: "Algebra sheet 1",
      type: "task.created",
    });
    expect(history.events.at(-1)?.taskTitle).toBe("Algebra sheet 1");
    const instants = history.events.map((entry) => `${entry.occurredAt}${entry.recordedAt}`);
    expect(instants).toEqual([...instants].toSorted((a, b) => a.localeCompare(b)).toReversed());
  });
});

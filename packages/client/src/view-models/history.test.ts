import { describe, expect, it } from "vitest";

import { addMinutesIso } from "@pace/core";
import { CALC_HW5_ID, HW_ID, MOSCOW, NOW, sheetId, TRK_ID } from "@pace/core/testing";

import type { AppState } from "../state.ts";

import { setupActions, unwrap } from "../actions/fixture.fake.ts";
import { completeHistoryOf } from "../history-types.ts";
import { historyViewModel } from "./history.ts";

const fullSource = (state: AppState) => unwrap(completeHistoryOf(state));

describe("historyViewModel", () => {
  it("names how a task was closed: done, cancelled or skipped (QA round 20 L8)", async () => {
    const world = await setupActions();
    const [skipped] = unwrap(await world.actions.closeTask({ outcome: "skipped", taskId: TRK_ID }));
    const history = historyViewModel(fullSource(world.state.store.getState()), {
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
    const history = historyViewModel(fullSource(world.state.store.getState()), {
      atIso: NOW,
      deviceTz: MOSCOW,
    });
    const rows = history.events.filter((entry) => entry.type === "event.revoked");
    expect(rows).toHaveLength(1);
    expect(new Set(rows[0]?.ids)).toEqual(new Set(batch.map((event) => event.id)));
  });

  it("shows one write of several events as one row whose Undo takes all of it back (owner R27-05, QA round 28 R28-05)", async () => {
    const world = await setupActions([]);
    unwrap(
      await world.actions.logPast({
        category: "study",
        endAt: addMinutesIso(NOW, -60),
        label: "Lecture",
        startAt: addMinutesIso(NOW, -180),
      }),
    );
    // Logged inside the lecture: one write of three events (the block, the cut, the rest of it).
    const written = unwrap(
      await world.actions.logPast({
        category: "rest",
        endAt: addMinutesIso(NOW, -120),
        label: "Call",
        startAt: addMinutesIso(NOW, -150),
      }),
    );
    const rows = () =>
      historyViewModel(fullSource(world.state.store.getState()), { atIso: NOW, deviceTz: MOSCOW })
        .events;
    const row = rows().find((entry) => entry.ids.includes(written[0]?.id ?? ""));
    expect(row).toMatchObject({ revocable: true, type: "activity.logged" });
    expect(new Set(row?.ids)).toEqual(new Set(written.map((event) => event.id)));
    // The earlier write, recorded at the same clock reading, stays a row of its own.
    expect(rows().filter((entry) => entry.type === "activity.logged")).toHaveLength(2);
    unwrap(await world.actions.revokeAll(row?.ids ?? []));
    expect(
      Object.values(world.state.store.getState().time.activities).map((item) => item.label),
    ).toEqual(["Lecture"]);
  });

  it("undoes what is still in effect of a batch partly taken back another way (review I2)", async () => {
    const world = await setupActions();
    const [done] = unwrap(await world.actions.closeTask({ outcome: "done", taskId: TRK_ID }));
    const [started] = unwrap(await world.actions.startChoice("rest"));
    if (done === undefined || started === undefined) {
      throw new Error("written");
    }
    const [first, second] = unwrap(await world.actions.revokeAll([done.id, started.id]));
    if (first === undefined || second === undefined) {
      throw new Error("revoked");
    }
    // One member of the batch taken back alone (an older client, MCP's revoke_event), later.
    world.setNow(addMinutesIso(NOW, 1));
    unwrap(await world.actions.revoke(first.id));
    const rowsOf = () =>
      historyViewModel(fullSource(world.state.store.getState()), {
        atIso: NOW,
        deviceTz: MOSCOW,
      }).events.filter((entry) => entry.ids.includes(first.id) || entry.ids.includes(second.id));
    // The row says what holds: the part still in effect can be undone, the other says revoked.
    const inEffect = rowsOf().find((entry) => entry.revokedBy === null);
    expect(inEffect?.ids).toEqual([second.id]);
    expect(rowsOf().find((entry) => entry.revokedBy !== null)?.ids).toEqual([first.id]);
    // Its Undo goes through, and nothing of the batch is left to undo after it.
    unwrap(await world.actions.revokeAll(inEffect?.ids ?? []));
    expect(rowsOf().every((entry) => entry.revokedBy !== null)).toBe(true);
  });

  it("keeps naming a task whose creation was undone, and offers no Undo for its later rows (QA round 27 R27-07)", async () => {
    const world = await setupActions();
    const [created] = unwrap(
      await world.actions.createTask({ presetId: "personal", title: "Call the bank" }),
    );
    const taskId = created?.type === "task.created" ? created.payload.taskId : "";
    const [importance] = unwrap(await world.actions.setImportance(taskId, "asap"));
    unwrap(await world.actions.revoke(created?.id ?? ""));
    const row = historyViewModel(fullSource(world.state.store.getState()), {
      atIso: NOW,
      deviceTz: MOSCOW,
    }).events.find((entry) => entry.id === importance?.id);
    expect(row).toMatchObject({ revocable: false, taskTitle: "Call the bank" });
  });

  it("names a gone task by a title an amendment wrote last (QA 27 wave review M6)", async () => {
    const world = await setupActions();
    const [created] = unwrap(
      await world.actions.createTask({ presetId: "personal", title: "Call the bank" }),
    );
    const taskId = created?.type === "task.created" ? created.payload.taskId : "";
    const [importance] = unwrap(await world.actions.setImportance(taskId, "asap"));
    // A retitle written as an amendment of the creation (an assistant's correction), then undone.
    unwrap(
      await world.state.dispatch({
        occurredAt: NOW,
        payload: { patch: { title: "Call the bank about the card" }, targetId: created?.id ?? "" },
        precision: "exact",
        source: "app",
        type: "event.amended",
      }),
    );
    unwrap(await world.actions.revoke(created?.id ?? ""));
    const row = historyViewModel(fullSource(world.state.store.getState()), {
      atIso: NOW,
      deviceTz: MOSCOW,
    }).events.find((entry) => entry.id === importance?.id);
    expect(row).toMatchObject({ taskTitle: "Call the bank about the card" });
  });

  it("names the activity an activity event is about", async () => {
    const world = await setupActions();
    const [started] = unwrap(await world.actions.startChoice("rest"));
    const history = historyViewModel(fullSource(world.state.store.getState()), {
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
      historyViewModel(fullSource(world.state.store.getState()), {
        atIso: NOW,
        deviceTz: MOSCOW,
      }).events.find((entry) => entry.id === id)?.taskTitle;
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
    const history = historyViewModel(fullSource(world.state.store.getState()), {
      atIso: NOW,
      deviceTz: MOSCOW,
    });

    expect(history.at).toBe(NOW);
    expect(history.board.rows.map((row) => row.id)).toContain(CALC_HW5_ID);
    const monday = historyViewModel(fullSource(world.state.store.getState()), {
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

import { describe, expect, it } from "vitest";

import { CALC_HW5_ID, HW_ID, MOSCOW, NOW, sheetId, TRK_ID } from "@pace/core/testing";

import { setupActions, unwrap } from "../actions/fixture.fake.ts";
import { historyViewModel } from "./history.ts";

describe("historyViewModel", () => {
  it("shows the board at an instant and the log newest first with what can be undone", async () => {
    const world = await setupActions();
    const [solved] = unwrap(await world.actions.markSolved(HW_ID, "s5"));
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
    const instants = history.events.map((entry) => `${entry.occurredAt}${entry.recordedAt}`);
    expect(instants).toEqual([...instants].toSorted((a, b) => a.localeCompare(b)).toReversed());
  });
});

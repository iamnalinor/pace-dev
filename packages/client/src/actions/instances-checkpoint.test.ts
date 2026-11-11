import { describe, expect, it } from "vitest";

import { createCheckpoint, type Event, type SequencedCheckpointEvent } from "@pace/core";
import { artboardEvents, MOSCOW } from "@pace/core/testing";

import { createMemoryEventStore } from "../adapters/memory-event-store.ts";
import { createAppState } from "../state.ts";
import { createActions } from "./actions.ts";

/*
The system's own events on a checkpoint copy (PR 55 review, minor): an instance issued before the
base's last event needs the source, as any backdated event does. The refusal used to be dropped,
so on a checkpoint copy the week's instances were never written, on every foreground again.
*/

const NOW = "2026-10-13T12:00:00.000Z";
/** Written after week 42's instances were due to be issued: the base's last event. */
const lastOfBase: Event = {
  deviceId: "remote",
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAZ",
  occurredAt: "2026-10-13T11:00:00.000Z",
  payload: { language: "en" },
  precision: "exact",
  recordedAt: "2026-10-13T11:00:00.000Z",
  source: "web",
  type: "settings.updated",
};

const setup = async () => {
  const source: readonly SequencedCheckpointEvent[] = [...artboardEvents(), lastOfBase].map(
    (event, index) => ({ event, seq: index + 1 }),
  );
  const base = createCheckpoint({
    storeId: "one",
    build: "opaque",
    coveredSeq: source.length,
    cutoff: NOW,
    cutoffTimezone: "UTC",
    records: source,
  });
  if (!base.ok) {
    throw new Error(base.error);
  }
  const disk = createMemoryEventStore();
  await disk.installBootstrap({
    guard: await disk.readMeta(),
    checkpoint: { json: JSON.stringify(base.value), sha256: "a".repeat(64), value: base.value },
    records: [],
    seq: source.length,
    syncVersion: 1,
  });
  const state = createAppState({ deviceId: "dev-1", now: () => NOW, source: "web", store: disk });
  await state.ready;
  const actions = createActions({
    clock: { deviceTz: MOSCOW, now: () => NOW },
    source: "web",
    state,
  });
  /** What the history coordinator does once the complete source arrived. */
  const loadSource = async () =>
    await state.commitSnapshot(
      async () =>
        await disk.installHistory({
          guard: await disk.readMeta(),
          through: source.length,
          sourceRecords: source,
        }),
    );
  return { actions, disk, loadSource, state };
};

describe("ensureInstances on a checkpoint copy", () => {
  it("loads the source once for instances issued before the base's last event, then writes them", async () => {
    const { actions, loadSource, state } = await setup();
    let loads = 0;
    state.setHistoryLoader(async () => {
      loads += 1;
      const loaded = await loadSource();
      return loaded.ok ? { ok: true, value: undefined } : loaded;
    });
    // The same four a full copy writes at this instant (`actions.test.ts`).
    await expect(actions.ensureInstances()).resolves.toBe(4);
    expect(loads).toBe(1);
    expect(state.store.getState().historyCoverage).toBe("full");
    expect(state.store.getState().tasks.byId["hw:hw.algebra:2026-W42"]?.title).toBe("Algebra HW 2");
    await expect(actions.ensureInstances()).resolves.toBe(0);
    expect(loads).toBe(1);
  });

  it("asks for the source once per call when it cannot be had, and writes what needs none", async () => {
    const { actions, disk, state } = await setup();
    let loads = 0;
    state.setHistoryLoader(async () => {
      loads += 1;
      return { ok: false, error: "history/offline" };
    });
    const written = await actions.ensureInstances();
    expect(loads).toBe(1);
    expect(written).toBeLessThan(4);
    expect(await disk.listPending()).toHaveLength(written);
    expect(state.store.getState()).toMatchObject({
      historyCoverage: "checkpoint",
      status: "ready",
    });
  });
});

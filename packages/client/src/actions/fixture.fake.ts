import { createCheckpoint, err, type Event, ok, type Result } from "@pace/core";
import { artboardEvents, MOSCOW, NOW } from "@pace/core/testing";

import type { Clock } from "../clock.ts";
import type { EventStore } from "../event-store.ts";

import { createMemoryEventStore } from "../adapters/memory-event-store.ts";
import { seedSynced } from "../local-store.fake.ts";
import { type AppStateHandle, createAppState } from "../state.ts";
import { type Actions, createActions } from "./actions.ts";

export type ActionsWorld = {
  readonly actions: Actions;
  readonly state: AppStateHandle;
  /** Moves the frozen clock; the next action reads the new instant. */
  readonly setNow: (iso: string) => void;
  readonly rematerializeCalls: () => number;
};

/** The artboard world in a memory store, driven by the web client with a frozen clock. */
export const setupActions = async (
  seed: readonly Event[] = artboardEvents(),
  store: EventStore = createMemoryEventStore(),
): Promise<ActionsWorld> => {
  await seedSynced(store, seed);
  let now = NOW;
  const clock: Clock = { deviceTz: MOSCOW, now: () => now };
  const inner = createAppState({ deviceId: "dev-1", now: clock.now, source: "web", store });
  let rematerializeCalls = 0;
  const state: AppStateHandle = {
    ...inner,
    rematerialize: async () => {
      rematerializeCalls += 1;
      await inner.rematerialize();
    },
  };
  await state.ready;
  return {
    actions: createActions({ clock, source: "web", state }),
    rematerializeCalls: () => rematerializeCalls,
    setNow: (iso) => {
      now = iso;
    },
    state,
  };
};

/** Unwraps a successful action; a failure fails the test with its code. */
export const unwrap = <T>(
  result: { readonly ok: false; readonly error: string } | { readonly ok: true; readonly value: T },
): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

export type CheckpointWorld = {
  readonly actions: Actions;
  readonly state: AppStateHandle;
  /** How many times an action asked for the complete history. */
  readonly loads: () => number;
};

/**
The same log as a checkpoint copy: every event of `source` sits in the base (none in the tail),
and the history loader installs the complete source as the coordinator does once it came.
*/
export const setupCheckpointActions = async (
  source: readonly Event[],
  now: string,
): Promise<CheckpointWorld> => {
  const records = source.map((event, index) => ({ event, seq: index + 1 }));
  const base = createCheckpoint({
    storeId: "one",
    build: "opaque",
    coveredSeq: records.length,
    cutoff: now,
    cutoffTimezone: "UTC",
    records,
  });
  if (!base.ok) {
    throw new Error(base.error);
  }
  const disk = createMemoryEventStore();
  await disk.installBootstrap({
    guard: await disk.readMeta(),
    checkpoint: { json: JSON.stringify(base.value), sha256: "a".repeat(64), value: base.value },
    records: [],
    seq: records.length,
    syncVersion: 1,
  });
  const clock: Clock = { deviceTz: MOSCOW, now: () => now };
  const state = createAppState({ deviceId: "dev-1", now: clock.now, source: "web", store: disk });
  await state.ready;
  let loads = 0;
  state.setHistoryLoader(async (): Promise<Result<void, "history/incomplete">> => {
    // A complete copy answers at once, as the coordinator's capture does: nothing is read.
    if (state.store.getState().historyCoverage === "full") {
      return ok(undefined);
    }
    loads += 1;
    const installed = await state.commitSnapshot(
      async () =>
        await disk.installHistory({
          guard: await disk.readMeta(),
          through: records.length,
          sourceRecords: records,
        }),
    );
    return installed.ok ? ok(undefined) : err("history/incomplete");
  });
  return {
    actions: createActions({ clock, source: "web", state }),
    loads: () => loads,
    state,
  };
};

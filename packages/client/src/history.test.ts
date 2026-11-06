import { describe, expect, it } from "vitest";

import { createCheckpoint } from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { at, settingsEvent } from "./fake-fetch.fake.ts";
import { createHistoryCoordinator } from "./history.ts";
import { createAppState } from "./state.ts";

const old = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(8), { language: "ru" });
const setup = async () => {
  const disk = createMemoryEventStore();
  const checkpoint = createCheckpoint({
    storeId: "one",
    build: "server-build",
    coveredSeq: 3,
    cutoff: at(9),
    cutoffTimezone: "UTC",
    records: [{ seq: 3, event: old }],
  });
  if (!checkpoint.ok) {
    throw new Error(checkpoint.error);
  }
  await disk.installBootstrap({
    guard: await disk.readSnapshot(),
    checkpoint: {
      json: JSON.stringify(checkpoint.value),
      sha256: "a".repeat(64),
      value: checkpoint.value,
    },
    records: [],
    seq: 3,
    syncVersion: 2,
  });
  const state = createAppState({
    store: disk,
    now: () => at(12),
    deviceId: "device",
    source: "web",
  });
  await state.ready;
  return { disk, state };
};
describe("complete history", () => {
  it("coalesces full-source demand and installs without changing cursor or pending writes", async () => {
    const { disk, state } = await setup();
    let calls = 0;
    const { promise: held, resolve: release } = Promise.withResolvers<null>();
    const history = createHistoryCoordinator({
      store: disk,
      state,
      pull: async (since, _limit, query) => {
        calls++;
        expect(query).toMatchObject({ storeId: "one", through: 3, checkpointVersion: 1 });
        await held;
        return {
          since,
          seq: 3,
          storeId: "one",
          events: [old],
          records: [{ seq: 3, event: old }],
          more: false,
        };
      },
    });
    const first = history.ensureComplete();
    const second = history.ensureComplete();
    await Promise.resolve();
    await state.dispatch({
      type: "settings.updated",
      occurredAt: at(10),
      payload: { language: "en" },
    });
    release(null);
    expect(await first).toEqual({ ok: true, value: undefined });
    expect(await second).toEqual({ ok: true, value: undefined });
    expect(calls).toBe(1);
    expect(state.store.getState()).toMatchObject({
      historyCoverage: "full",
      settings: { language: "en" },
    });
    expect(await disk.getCursor()).toBe(3);
    expect(await disk.listPending()).toHaveLength(1);
    await history.ensureComplete();
    expect(calls).toBe(1);
  });
  it("fails unknown source instead of silently claiming complete coverage", async () => {
    const { disk, state } = await setup();
    const history = createHistoryCoordinator({
      store: disk,
      state,
      pull: async (since) => ({
        since,
        seq: 3,
        storeId: "one",
        events: [],
        records: [{ seq: 3, event: { ...old, type: "unknown" } }],
        more: false,
      }),
    });
    expect(await history.ensureComplete()).toEqual({ ok: false, error: "history/incomplete" });
    expect(state.store.getState()).toMatchObject({
      historyCoverage: "checkpoint",
      historyStatus: "failed",
      settings: { language: "ru" },
    });
  });
  it("invalidates late hydration on close", async () => {
    const { disk, state } = await setup();
    const { promise: held, resolve: release } = Promise.withResolvers<null>();
    const history = createHistoryCoordinator({
      store: disk,
      state,
      pull: async (since) => {
        await held;
        return {
          since,
          seq: 3,
          storeId: "one",
          events: [old],
          records: [{ seq: 3, event: old }],
          more: false,
        };
      },
    });
    const completion = history.ensureComplete();
    history.close();
    release(null);
    expect(await completion).toEqual({ ok: false, error: "sync/copy-changed" });
    expect((await disk.readSnapshot()).coverage).toBe("checkpoint");
  });
});

describe("history failure boundaries", () => {
  it("normalizes snapshot read rejection and leaves a retryable failed resource", async () => {
    const { disk, state } = await setup();
    const history = createHistoryCoordinator({
      store: {
        ...disk,
        readSnapshot: async () => {
          throw new Error("disk failed");
        },
      },
      state,
      pull: async () => {
        throw new Error("unexpected network");
      },
    });
    expect(await history.ensureComplete()).toEqual({ ok: false, error: "history/unavailable" });
    expect(state.store.getState()).toMatchObject({
      historyStatus: "failed",
      historyError: "history/unavailable",
    });
  });
  it("normalizes rejected readiness instead of rejecting its Result API", async () => {
    const { disk, state } = await setup();
    const history = createHistoryCoordinator({
      store: disk,
      state: { ...state, ready: Promise.reject(new Error("bad disk")) },
      pull: async () => {
        throw new Error("unexpected network");
      },
    });
    expect(await history.ensureComplete()).toEqual({ ok: false, error: "history/unavailable" });
  });
  it("does not paint an old-copy completion onto a newly claimed account", async () => {
    const { disk, state } = await setup();
    const { promise: held, resolve: release } = Promise.withResolvers<null>();
    const { promise: started, resolve: requested } = Promise.withResolvers<null>();
    const history = createHistoryCoordinator({
      store: disk,
      state,
      pull: async (since) => {
        requested(null);
        await held;
        return {
          since,
          seq: 3,
          storeId: "one",
          records: [{ seq: 3, event: old }],
          events: [old],
          more: false,
        };
      },
    });
    const completion = history.ensureComplete();
    await started;
    await state.claim("new-owner");
    release(null);
    expect(await completion).toEqual({ ok: false, error: "sync/copy-changed" });
    expect(state.store.getState().historyStatus).not.toBe("failed");
  });
});

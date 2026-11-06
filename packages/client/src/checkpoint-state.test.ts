import { describe, expect, it } from "vitest";

import { createCheckpoint } from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { at, settingsEvent } from "./fake-fetch.fake.ts";
import { createAppState } from "./state.ts";

const old = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(8), { language: "ru" });
const setup = async () => {
  const disk = createMemoryEventStore();
  const checkpoint = createCheckpoint({
    storeId: "one",
    build: "opaque",
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
describe("checkpoint state", () => {
  it("loads base projections and known IDs without pretending the resident log is complete", async () => {
    const { state } = await setup();
    expect(state.store.getState()).toMatchObject({
      settings: { language: "ru" },
      historyCoverage: "checkpoint",
      log: [],
      status: "ready",
    });
    expect(state.store.getState().knownEventIds.has(old.id)).toBe(true);
  });
  it("keeps base when safe offline writes are reloaded", async () => {
    const { state } = await setup();
    expect(
      (
        await state.dispatch({
          type: "settings.updated",
          occurredAt: at(10),
          payload: { language: "en" },
        })
      ).ok,
    ).toBe(true);
    await state.rematerialize();
    expect(state.store.getState().settings.language).toBe("en");
    expect(state.store.getState().knownEventIds.has(old.id)).toBe(true);
  });
  it("refuses direct correction and canonical backdate before mutation or outbox entry", async () => {
    const { state, disk } = await setup();
    expect(
      await state.dispatch({
        type: "event.revoked",
        occurredAt: at(11),
        payload: { targetId: old.id },
      }),
    ).toEqual({ ok: false, error: "history/not-loaded" });
    expect(
      await state.dispatch({
        type: "settings.updated",
        occurredAt: at(7),
        payload: { language: "en" },
      }),
    ).toEqual({ ok: false, error: "history/not-loaded" });
    expect(await disk.listPending()).toEqual([]);
    expect(state.store.getState().settings.language).toBe("ru");
  });
});

describe("unreadable persisted partial state", () => {
  it("keeps recovery readiness separate from usable projections and refuses local writes", async () => {
    const disk = createMemoryEventStore();
    const image = await disk.readSnapshot();
    const broken = {
      ...disk,
      readSnapshot: async () => ({ ...image, coverage: "checkpoint" as const, checkpoint: null }),
    };
    const state = createAppState({
      store: broken,
      now: () => at(12),
      deviceId: "device",
      source: "web",
    });
    await state.ready;
    expect(state.store.getState()).toMatchObject({
      status: "loading",
      historyCoverage: "checkpoint",
      historyStatus: "failed",
    });
    expect(
      await state.dispatch({
        type: "settings.updated",
        occurredAt: at(10),
        payload: { language: "ru" },
      }),
    ).toEqual({ ok: false, error: "history/not-loaded" });
    expect(await disk.listPending()).toEqual([]);
  });
});

describe("public remote ingest on a partial copy", () => {
  it("refuses an unsafe source event before changing the resident log", async () => {
    const { state, disk } = await setup();
    const correction = {
      ...old,
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAF",
      occurredAt: at(10),
      type: "event.revoked",
      payload: { targetId: old.id },
    } as const;
    await expect(state.ingest([correction])).rejects.toThrow("history/not-loaded");
    expect(await disk.listAll()).toEqual([]);
    expect(
      (
        await state.dispatch({
          type: "settings.updated",
          occurredAt: at(11),
          payload: { language: "en" },
        })
      ).ok,
    ).toBe(true);
    expect(state.store.getState().knownEventIds.has(correction.id)).toBe(false);
  });
});

describe("ordinary current activity fields offline", () => {
  it("edits from base projections without history traffic while source-origin deletion refuses", async () => {
    const disk = createMemoryEventStore();
    const activity = {
      ...old,
      type: "activity.started",
      payload: { activityId: old.id, label: "Old activity", category: "work" },
    } as const;
    const base = createCheckpoint({
      storeId: "one",
      build: "opaque",
      coveredSeq: 3,
      cutoff: at(9),
      cutoffTimezone: "UTC",
      records: [{ seq: 3, event: activity }],
    });
    if (!base.ok) {
      throw new Error(base.error);
    }
    await disk.installBootstrap({
      guard: await disk.readSnapshot(),
      checkpoint: { json: JSON.stringify(base.value), sha256: "a".repeat(64), value: base.value },
      records: [],
      seq: 3,
      syncVersion: 2,
    });
    const state = createAppState({
      store: disk,
      deviceId: "device",
      now: () => at(12),
      source: "web",
    });
    await state.ready;
    let requests = 0;
    state.setHistoryLoader(async () => {
      requests++;
      return { ok: false, error: "history/offline" };
    });
    const { createActions } = await import("./actions/actions.ts");
    const actions = createActions({
      state,
      source: "web",
      clock: { now: () => at(12), deviceTz: "UTC" },
    });
    expect((await actions.relabelActivity(old.id, { label: "Offline label" })).ok).toBe(true);
    expect((await actions.adjustActivity(old.id, { startAt: at(7) })).ok).toBe(true);
    expect(requests).toBe(0);
    expect(state.store.getState().time.activities[old.id]).toMatchObject({
      label: "Offline label",
      startAt: at(7),
    });
    expect(await actions.deleteActivity(old.id)).toEqual({ ok: false, error: "history/offline" });
    expect(requests).toBe(1);
    expect(await disk.listPending()).toHaveLength(2);
  });
});

describe("complete history readiness", () => {
  it("refuses an unloaded full-coverage AppState as a complete source", async () => {
    const { state } = await setup();
    const { completeHistoryOf } = await import("./history-types.ts");
    expect(
      completeHistoryOf({ ...state.store.getState(), historyCoverage: "full", status: "loading" }),
    ).toEqual({ ok: false, error: "history/not-loaded" });
  });
});

describe("shared copy ownership at local persistence", () => {
  it("refuses a held ordinary write when another owner claims before the transaction", async () => {
    const { createHeldEventStore } = await import("./held-event-store.fake.ts");
    const held = createHeldEventStore();
    const state = createAppState({
      store: held.store,
      deviceId: "device",
      now: () => at(12),
      source: "web",
    });
    await state.ready;
    await state.claim("owner-a");
    held.hold();
    const completion = state.dispatch({
      type: "settings.updated",
      occurredAt: at(10),
      payload: { language: "en" },
    });
    for (let turn = 0; turn < 20 && held.writes.length === 0; turn++) {
      await Promise.resolve();
    }
    expect(held.writes).toHaveLength(1);
    await held.store.setOwner("owner-b");
    held.release();
    const foreign = { ...old, id: "01ARZ3NDEKTSV4RRFFQ69G5FAZ" };
    await held.store.append([foreign]);
    await held.writes[0]?.resolve();
    expect(await completion).toEqual({ ok: false, error: "persist_failed" });
    expect(await held.store.listAll()).toEqual([foreign]);
  });
  it("does not adopt another owner's projections through rematerialize", async () => {
    const { state, disk } = await setup();
    await state.claim("owner-a");
    await disk.clear();
    await disk.setOwner("owner-b");
    await disk.append([old]);
    await expect(state.rematerialize()).rejects.toThrow("sync/copy-changed");
    expect(state.store.getState().log).toEqual([]);
    expect(state.localCopy()?.owner).toBe("owner-a");
  });
});

describe("append rebasing at the transaction", () => {
  it("keeps a held safe action when its still-owned unconfirmed copy receives its first checkpoint", async () => {
    const { createHeldEventStore } = await import("./held-event-store.fake.ts");
    const held = createHeldEventStore();
    const state = createAppState({
      store: held.store,
      deviceId: "device",
      now: () => at(12),
      source: "web",
    });
    await state.ready;
    await state.claim("owner");
    held.hold();
    const completion = state.dispatch({
      type: "settings.updated",
      occurredAt: at(10),
      payload: { language: "en" },
    });
    for (let turn = 0; turn < 20 && held.writes.length === 0; turn++) {
      await Promise.resolve();
    }
    const cp = createCheckpoint({
      storeId: "one",
      build: "opaque",
      coveredSeq: 3,
      cutoff: at(9),
      cutoffTimezone: "UTC",
      records: [{ seq: 3, event: old }],
    });
    if (!cp.ok) {
      throw new Error(cp.error);
    }
    await held.store.installBootstrap({
      guard: await held.store.readSnapshot(),
      checkpoint: { json: JSON.stringify(cp.value), sha256: "a".repeat(64), value: cp.value },
      records: [],
      seq: 3,
      syncVersion: 2,
    });
    await held.writes[0]?.resolve();
    expect((await completion).ok).toBe(true);
    await state.rematerialize();
    expect(state.store.getState()).toMatchObject({
      historyCoverage: "checkpoint",
      settings: { language: "en" },
    });
    expect(await held.store.listPending()).toHaveLength(1);
  });
  it("does not adopt a replacement owner between an atomic page commit and its memory reload", async () => {
    const { state, disk } = await setup();
    await state.claim("owner-a");
    const guard = await disk.readSnapshot();
    const foreign = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAZ", old.occurredAt, { language: "en" });
    await expect(
      state.commitSnapshot(async () => {
        const installed = await disk.applyRemotePage({
          guard,
          storeId: "one",
          since: 3,
          seq: 7,
          records: [{ seq: 7, event: foreign }],
        });
        await disk.clear();
        await disk.setOwner("owner-b");
        await disk.append([foreign]);
        return installed;
      }),
    ).rejects.toThrow("sync/copy-changed");
    expect(state.localCopy()?.owner).toBe("owner-a");
    expect(state.store.getState().settings.language).toBe("ru");
    expect(await disk.listAll()).toEqual([foreign]);
  });
});

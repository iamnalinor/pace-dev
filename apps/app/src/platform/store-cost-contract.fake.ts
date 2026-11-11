import type { EventStore } from "@pace/client";

import {
  baseEvent,
  checkpointFixture,
  laterEvent,
  pendingEvent,
} from "./checkpoint-store-contract.fake.ts";

/**
What the default (legacy) path costs on a real adapter (bug-lessons class 259). `logReads` counts
the adapter's reads of the whole stored log: an action's guarded write and a pulled page make none.
*/
export const storeCostContract = (
  open: () => Promise<EventStore>,
  logReads: () => number,
): void => {
  const synced = async (): Promise<EventStore> => {
    const store = await open();
    await store.setOwner("owner-a");
    const first = await store.applyLegacyPage({
      guard: await store.readMeta(),
      storeId: "store-a",
      since: 0,
      seq: 1,
      events: [baseEvent],
    });
    expect(first).toMatchObject({ ok: true, value: { isReplaced: false, events: [baseEvent] } });
    return store;
  };

  it("writes an action under its guard, lists the outbox and applies a page without reading the log", async () => {
    const store = await synced();
    const before = logReads();
    const guard = await store.readMeta();
    await store.append([pendingEvent], guard);
    await expect(store.listPending()).resolves.toEqual([pendingEvent]);
    const canonical = { ...pendingEvent, recordedAt: laterEvent.recordedAt };
    const page = await store.applyLegacyPage({
      guard,
      storeId: "store-a",
      since: 1,
      seq: 3,
      events: [canonical, laterEvent],
    });
    expect(logReads()).toBe(before);
    expect(page).toMatchObject({
      ok: true,
      value: { isReplaced: false, meta: { cursor: 3, storeId: "store-a", owner: "owner-a" } },
    });
    expect(await store.readSnapshot()).toMatchObject({
      cursor: 3,
      pendingIds: [],
      records: [baseEvent, canonical, laterEvent].map((event) => ({ event, seq: null })),
    });
    // The probe does see a read of the log: the whole copy was just read.
    expect(logReads()).toBe(before + 1);
  });

  it("answers a guard's meta as the whole copy holds it", async () => {
    const store = await synced();
    const { checkpoint, pendingIds, records, ...meta } = await store.readSnapshot();
    expect(await store.readMeta()).toEqual(meta);
    expect({ checkpoint, pendingIds, records }).toMatchObject({ checkpoint: null, pendingIds: [] });
  });

  it("refuses a guarded write and a page of a copy that changed hands, writing nothing", async () => {
    const store = await synced();
    const guard = await store.readMeta();
    await store.setOwner("owner-b");
    const before = await store.readSnapshot();
    await expect(store.append([pendingEvent], guard)).rejects.toThrow("sync/copy-changed");
    expect(
      await store.applyLegacyPage({
        guard,
        storeId: "store-a",
        since: 1,
        seq: 2,
        events: [laterEvent],
      }),
    ).toEqual({ ok: false, error: "sync/copy-changed" });
    expect(await store.readSnapshot()).toEqual(before);
  });

  it("drops the log, the outbox and the cursor for another server generation's first page", async () => {
    const store = await synced();
    const guard = await store.readMeta();
    await store.append([pendingEvent], guard);
    const page = await store.applyLegacyPage({
      guard,
      storeId: "store-b",
      since: 0,
      seq: 1,
      events: [laterEvent],
    });
    expect(page).toMatchObject({ ok: true, value: { isReplaced: true } });
    const after = await store.readSnapshot();
    expect(after).toMatchObject({
      coverage: "full",
      cursor: 1,
      owner: "owner-a",
      pendingIds: [],
      records: [{ event: laterEvent, seq: null }],
      storeId: "store-b",
    });
    expect(after.copyToken).not.toBe(guard.copyToken);
    expect(page.ok && page.value.meta).toEqual(await store.readMeta());
  });

  it("turns a checkpoint's copy into a full one for a legacy page from the log's start, keeping the outbox", async () => {
    const store = await open();
    await store.setOwner("owner-a");
    const installed = await store.installBootstrap({
      guard: await store.readMeta(),
      checkpoint: await checkpointFixture(),
      records: [{ seq: 2, event: laterEvent }],
      seq: 2,
      syncVersion: 1,
    });
    expect(installed).toMatchObject({ ok: true, value: { coverage: "checkpoint" } });
    const guard = await store.readMeta();
    await store.append([pendingEvent], guard);
    // A page that continues the cursor is not the whole log: the copy stays as it is.
    expect(
      await store.applyLegacyPage({ guard, storeId: "store-a", since: 2, seq: 2, events: [] }),
    ).toEqual({ ok: false, error: "history/rebuild-required" });
    const page = await store.applyLegacyPage({
      guard,
      storeId: "store-a",
      since: 0,
      seq: 1,
      events: [baseEvent],
    });
    expect(page).toMatchObject({
      ok: true,
      value: { isConverted: true, isReplaced: false, meta: { coverage: "full", cursor: 1 } },
    });
    const after = await store.readSnapshot();
    expect(after).toMatchObject({
      checkpoint: null,
      copyToken: guard.copyToken,
      coverage: "full",
      cursor: 1,
      owner: "owner-a",
      pendingIds: [pendingEvent.id],
      storeId: "store-a",
    });
    expect(after.records).toEqual([
      { event: baseEvent, seq: null },
      { event: pendingEvent, seq: null },
    ]);
    expect(page.ok && page.value.meta).toEqual(await store.readMeta());
  });
};

import { createHash } from "node:crypto";

import type { EventStore, Sha256Text, ValidatedCheckpoint } from "@pace/client";

import { seedCopy } from "@pace/client/testing";
import { createCheckpoint, type Event, type SequencedCheckpointEvent } from "@pace/core";

export const checkpointTestHash: Sha256Text = async (text) =>
  createHash("sha256").update(text).digest("hex");

const eventAt = (id: string, hour: number): Event => ({
  id,
  type: "settings.updated",
  deviceId: "phone",
  occurredAt: `2026-10-06T${String(hour).padStart(2, "0")}:00:00.000Z`,
  recordedAt: `2026-10-06T${String(hour).padStart(2, "0")}:00:00.000Z`,
  precision: "exact",
  source: "app",
  payload: { language: "ru" },
});

export const baseEvent = eventAt("01ARZ3NDEKTSV4RRFFQ69G5FAA", 9);
export const pendingEvent = eventAt("01ARZ3NDEKTSV4RRFFQ69G5FAB", 10);
export const laterEvent = eventAt("01ARZ3NDEKTSV4RRFFQ69G5FAC", 11);

export const checkpointFixture = async (
  storeId = "store-a",
  records: readonly SequencedCheckpointEvent[] = [{ seq: 1, event: baseEvent }],
): Promise<ValidatedCheckpoint> => {
  const built = createCheckpoint({
    storeId,
    build: "adapter-test",
    coveredSeq: records.at(-1)?.seq ?? 0,
    cutoff: "2026-10-07T00:00:00.000Z",
    cutoffTimezone: "UTC",
    records,
  });
  if (!built.ok) {
    throw new Error(built.error);
  }
  const json = JSON.stringify(built.value);
  return { json, sha256: await checkpointTestHash(json), value: built.value };
};

const ownedStore = async (
  open: (hash?: Sha256Text) => Promise<EventStore>,
  input: { readonly initial?: readonly Event[]; readonly storeId?: string } = {},
) => {
  const store = await open();
  await store.setOwner("owner-a");
  if (input.storeId !== undefined) {
    await seedCopy(store, { storeId: input.storeId });
  }
  await store.append(input.initial ?? [], await store.readMeta());
  return store;
};
const ownerSwap = async (
  open: (hash?: Sha256Text) => Promise<EventStore>,
  input: {
    readonly initial?: readonly Event[];
    readonly storeId?: string;
    readonly replacement: Event;
  },
) => {
  const store = await ownedStore(open, input);
  const guard = await store.readSnapshot();
  const other = await open();
  await other.setOwner("owner-b");
  await other.append([input.replacement], await other.readMeta());
  return { store, guard, other, before: await other.readSnapshot() };
};
const installBase = async (store: EventStore) =>
  await store.installBootstrap({
    guard: await store.readSnapshot(),
    checkpoint: await checkpointFixture(),
    records: [],
    seq: 1,
    syncVersion: 2,
  });
const heldHasher = async (open: (hash?: Sha256Text) => Promise<EventStore>) => {
  const entered = Promise.withResolvers<null>();
  const release = Promise.withResolvers<null>();
  const store = await open(async (text) => {
    entered.resolve(null);
    await release.promise;
    return await checkpointTestHash(text);
  });
  return {
    store,
    entered: entered.promise,
    release: () => {
      release.resolve(null);
    },
  };
};

/** Same behavior on actual IndexedDB transactions and the SQLite-backed Expo test adapter. */
export const checkpointStoreContract = (open: (hash?: Sha256Text) => Promise<EventStore>): void => {
  it("installs and reloads a checkpoint while retaining same-generation offline writes", async () => {
    const store = await ownedStore(open, { storeId: "store-a", initial: [pendingEvent] });
    const guard = await store.readSnapshot();
    const base = await checkpointFixture();
    const installed = await store.installBootstrap({
      guard,
      checkpoint: base,
      records: [],
      seq: 1,
      syncVersion: 2,
    });
    expect(installed.ok).toBe(true);
    const reopened = await open();
    const snapshot = await reopened.readSnapshot();
    expect(snapshot.checkpoint).toEqual(base);
    expect(snapshot.coverage).toBe("checkpoint");
    expect(snapshot.cursor).toBe(1);
    expect(snapshot.owner).toBe("owner-a");
    expect(snapshot.copyToken).toBe(guard.copyToken);
    expect(await reopened.listPending()).toEqual([pendingEvent]);
  });

  it("discards the old generation's outbox and rotates copy identity", async () => {
    const store = await open();
    await store.setOwner("owner-a");
    await seedCopy(store, { storeId: "old-store" });
    await store.append([pendingEvent], await store.readMeta());
    const guard = await store.readSnapshot();
    const result = await store.installBootstrap({
      guard,
      checkpoint: await checkpointFixture(),
      records: [],
      seq: 1,
      syncVersion: 2,
    });
    expect(result.ok).toBe(true);
    const snapshot = await store.readSnapshot();
    expect(snapshot.copyToken).not.toBe(guard.copyToken);
    expect(snapshot.owner).toBe("owner-a");
    expect(snapshot.storeId).toBe("store-a");
    expect(await store.listPending()).toEqual([]);
  });

  it("refuses a late bootstrap after another tab claims the copy", async () => {
    const { store, guard, other, before } = await ownerSwap(open, { replacement: laterEvent });
    const result = await store.installBootstrap({
      guard,
      checkpoint: await checkpointFixture(),
      records: [],
      seq: 1,
      syncVersion: 2,
    });
    expect(result).toEqual({ ok: false, error: "sync/copy-changed" });
    expect(await other.readSnapshot()).toEqual(before);
  });

  it("hydrates the source without losing writes made during the download", async () => {
    const store = await open();
    await seedCopy(store, { storeId: "store-a" });
    const installed = await store.installBootstrap({
      guard: await store.readSnapshot(),
      checkpoint: await checkpointFixture(),
      records: [],
      seq: 1,
      syncVersion: 2,
    });
    expect(installed.ok).toBe(true);
    const guard = await store.readSnapshot();
    await store.append([pendingEvent, laterEvent], await store.readMeta());
    const result = await store.installHistory({
      guard,
      through: 1,
      sourceRecords: [{ seq: 1, event: baseEvent }],
    });
    expect(result.ok).toBe(true);
    expect(await store.listPending()).toEqual([pendingEvent, laterEvent]);
    const snapshot = await store.readSnapshot();
    expect(snapshot.coverage).toBe("full");
    expect(snapshot.checkpoint).toBeNull();
    expect(snapshot.cursor).toBe(1);
    expect(
      snapshot.records
        .map((record) => record.event.id)
        .toSorted((left, right) => left.localeCompare(right)),
    ).toEqual([baseEvent.id, pendingEvent.id, laterEvent.id]);
  });
  it("keeps unconfirmed owned pending writes on the first server generation", async () => {
    const store = await open();
    await store.setOwner("owner-a");
    await store.append([pendingEvent], await store.readMeta());
    const guard = await store.readSnapshot();
    expect(
      (
        await store.installBootstrap({
          guard,
          checkpoint: await checkpointFixture(),
          records: [],
          seq: 1,
          syncVersion: 2,
        })
      ).ok,
    ).toBe(true);
    expect(await store.listPending()).toEqual([pendingEvent]);
  });

  it("refuses pending envelopes whose ids are covered by a checkpoint without discarding them", async () => {
    const store = await open();
    await store.append([baseEvent], await store.readMeta());
    const before = await store.readSnapshot();
    expect(
      await store.installBootstrap({
        guard: before,
        checkpoint: await checkpointFixture(),
        records: [],
        seq: 1,
        syncVersion: 2,
      }),
    ).toEqual({ ok: false, error: "history/rebuild-required" });
    expect(await store.readSnapshot()).toEqual(before);
  });

  it("rotates identity on clear and refuses the former copy's late install", async () => {
    const store = await open();
    const guard = await store.readSnapshot();
    await store.clear();
    await store.append([laterEvent], await store.readMeta());
    const before = await store.readSnapshot();
    expect(before.copyToken).not.toBe(guard.copyToken);
    expect(
      await store.installBootstrap({
        guard,
        checkpoint: await checkpointFixture(),
        records: [],
        seq: 1,
        syncVersion: 2,
      }),
    ).toEqual({ ok: false, error: "sync/copy-changed" });
    expect(await store.readSnapshot()).toEqual(before);
  });

  it("replaces an acknowledged pending envelope with the canonical server record atomically", async () => {
    const store = await open();
    await store.append([pendingEvent], await store.readMeta());
    const canonical = { ...pendingEvent, recordedAt: "2026-10-06T10:00:01.000Z" };
    const result = await store.applyRemotePage({
      guard: await store.readSnapshot(),
      storeId: "store-a",
      since: 0,
      seq: 1,
      records: [{ seq: 1, event: canonical }],
    });
    expect(result.ok).toBe(true);
    expect(await store.listPending()).toEqual([]);
    expect((await store.readSnapshot()).records).toEqual([{ seq: 1, event: canonical }]);
    expect((await store.readMeta()).cursor).toBe(1);
  });

  it("refuses an older bootstrap finishing after a newer one without regressing its cursor", async () => {
    const store = await open();
    await seedCopy(store, { storeId: "store-a" });
    const guard = await store.readSnapshot();
    const checkpoint = await checkpointFixture();
    expect(
      (
        await store.installBootstrap({
          guard,
          checkpoint,
          records: [{ seq: 2, event: laterEvent }],
          seq: 2,
          syncVersion: 2,
        })
      ).ok,
    ).toBe(true);
    const before = await store.readSnapshot();
    expect(
      await store.installBootstrap({ guard, checkpoint, records: [], seq: 1, syncVersion: 2 }),
    ).toEqual({ ok: false, error: "history/rebuild-required" });
    expect(await store.readSnapshot()).toEqual(before);
  });

  it("allows pending writes while hashing and rechecks a changed base inside the install transaction", async () => {
    const store = await open();
    await installBase(store);
    const guard = await store.readSnapshot();
    const held = await heldHasher(open);
    const applying = held.store.applyRemotePage({
      guard,
      storeId: "store-a",
      since: 1,
      seq: 2,
      records: [{ seq: 2, event: laterEvent }],
    });
    await held.entered;
    await store.append([pendingEvent], await store.readMeta());
    expect(
      (
        await store.installHistory({
          guard,
          through: 1,
          sourceRecords: [{ seq: 1, event: baseEvent }],
        })
      ).ok,
    ).toBe(true);
    const before = await store.readSnapshot();
    held.release();
    expect(await applying).toEqual({ ok: false, error: "sync/copy-changed" });
    expect(await store.readSnapshot()).toEqual(before);
    expect(await store.listPending()).toEqual([pendingEvent]);
  });

  it("refuses an acknowledgement after another owner claims the copy", async () => {
    const { store, guard, other, before } = await ownerSwap(open, {
      storeId: "store-a",
      initial: [pendingEvent],
      replacement: laterEvent,
    });
    await expect(store.markSynced([pendingEvent.id, laterEvent.id], guard)).rejects.toThrow(
      "sync/copy-changed",
    );
    expect(await other.readSnapshot()).toEqual(before);
  });

  it("commits legacy canonical envelopes and cursor together without inventing source sequences", async () => {
    const store = await open();
    await store.setOwner("owner-a");
    await store.append([pendingEvent], await store.readMeta());
    const canonical = { ...pendingEvent, recordedAt: "2026-10-06T10:00:01.000Z" };
    const result = await store.applyLegacyPage({
      guard: await store.readSnapshot(),
      storeId: "store-a",
      since: 0,
      seq: 7,
      events: [baseEvent, canonical],
    });
    expect(result.ok).toBe(true);
    expect(await store.listPending()).toEqual([]);
    expect((await store.readMeta()).cursor).toBe(7);
    expect((await store.readSnapshot()).records).toEqual([
      { event: baseEvent, seq: null },
      { event: canonical, seq: null },
    ]);
  });

  it("refuses a legacy page captured before another owner claimed the copy", async () => {
    const { store, guard, other, before } = await ownerSwap(open, { replacement: laterEvent });
    expect(
      await store.applyLegacyPage({
        guard,
        storeId: "store-a",
        since: 0,
        seq: 1,
        events: [baseEvent],
      }),
    ).toEqual({ ok: false, error: "sync/copy-changed" });
    expect(await other.readSnapshot()).toEqual(before);
  });
  it("refuses an old owner's delayed local append without changing the replacement copy", async () => {
    const { store, guard, other, before } = await ownerSwap(open, { replacement: pendingEvent });
    await expect(store.append([laterEvent], guard)).rejects.toThrow("sync/copy-changed");
    expect(await other.readSnapshot()).toEqual(before);
  });

  it("checks a delayed local append inside its transaction after hashing and owner replacement", async () => {
    const store = await open();
    await store.setOwner("owner-a");
    await installBase(store);
    const guard = await store.readSnapshot();
    const held = await heldHasher(open);
    const appending = held.store.append([laterEvent], guard);
    await held.entered;
    await store.setOwner("owner-b");
    await store.append([pendingEvent], await store.readMeta());
    const before = await store.readSnapshot();
    held.release();
    await expect(appending).rejects.toThrow("sync/copy-changed");
    expect(await store.readSnapshot()).toEqual(before);
  });

  it("retains a local write across first generation confirmation on the same owned copy", async () => {
    const store = await open();
    await store.setOwner("owner-a");
    const guard = await store.readSnapshot();
    await store.applyRemotePage({
      guard,
      storeId: "store-a",
      since: 0,
      seq: 1,
      records: [{ seq: 1, event: baseEvent }],
    });
    await store.append([laterEvent], guard);
    expect(await store.listPending()).toEqual([laterEvent]);
    expect((await store.readMeta()).storeId).toBe("store-a");
  });
};

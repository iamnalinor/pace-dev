import { describe, expect, it } from "vitest";

import { createCheckpoint } from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { readTailRecords } from "./checkpoint-validation.ts";
import { at, settingsEvent } from "./fake-fetch.fake.ts";
import { seedCopy, storedEvents } from "./local-store.fake.ts";

const old = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(8), { language: "ru" });
const pending = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAB", at(10), { language: "en" });
const base = () => {
  const result = createCheckpoint({
    storeId: "one",
    build: "opaque",
    coveredSeq: 3,
    cutoff: at(9),
    cutoffTimezone: "UTC",
    records: [{ seq: 3, event: old }],
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return { json: JSON.stringify(result.value), sha256: "a".repeat(64), value: result.value };
};
describe("atomic checkpoint store", () => {
  it("keeps same-generation pending and drops foreign-generation pending atomically", async () => {
    const store = createMemoryEventStore();
    await store.setOwner("owner");
    await seedCopy(store, { storeId: "one" });
    await store.append([pending], await store.readMeta());
    const first = await store.readSnapshot();
    expect(
      (
        await store.installBootstrap({
          guard: first,
          checkpoint: base(),
          records: [],
          seq: 3,
          syncVersion: 2,
        })
      ).ok,
    ).toBe(true);
    expect(await store.listPending()).toEqual([pending]);
    const second = await store.readSnapshot();
    const checkpoint = base();
    const foreign = { ...checkpoint, value: { ...checkpoint.value, storeId: "two" } };
    const result = await store.installBootstrap({
      guard: second,
      checkpoint: foreign,
      records: [],
      seq: 3,
      syncVersion: 2,
    });
    expect(result.ok).toBe(true);
    expect(await store.listPending()).toEqual([]);
    expect((await store.readSnapshot()).owner).toBe("owner");
    expect((await store.readSnapshot()).copyToken).not.toBe(first.copyToken);
  });
  it("refuses stale ownership and forward cursor replacement with no partial changes", async () => {
    const store = createMemoryEventStore();
    const guard = await store.readSnapshot();
    await store.setOwner("new");
    expect(
      await store.installBootstrap({
        guard,
        checkpoint: base(),
        records: [],
        seq: 3,
        syncVersion: 2,
      }),
    ).toEqual({ ok: false, error: "sync/copy-changed" });
    await seedCopy(store, { storeId: "one" });
    const current = await store.readSnapshot();
    // The copy pulled on meanwhile: the guard is the same copy's, its cursor is behind.
    await seedCopy(store, { cursor: 10 });
    expect(
      await store.installBootstrap({
        guard: current,
        checkpoint: base(),
        records: [],
        seq: 3,
        syncVersion: 2,
      }),
    ).toEqual({ ok: false, error: "history/rebuild-required" });
    expect((await store.readMeta()).cursor).toBe(10);
  });
  it("does not acknowledge a base ID without its canonical source envelope", async () => {
    const store = createMemoryEventStore();
    await store.append([old], await store.readMeta());
    const guard = await store.readSnapshot();
    expect(
      await store.installBootstrap({
        guard,
        checkpoint: base(),
        records: [],
        seq: 3,
        syncVersion: 2,
      }),
    ).toEqual({ ok: false, error: "history/rebuild-required" });
    expect(await store.listPending()).toEqual([old]);
  });
  it("merges full source with writes arriving during hydration and keeps the current cursor", async () => {
    const store = createMemoryEventStore();
    const guard = await store.readSnapshot();
    await store.installBootstrap({
      guard,
      checkpoint: base(),
      records: [],
      seq: 3,
      syncVersion: 2,
    });
    const before = await store.readSnapshot();
    await store.append([pending], await store.readMeta());
    const result = await store.installHistory({
      guard: before,
      through: 3,
      sourceRecords: [{ seq: 3, event: old }],
    });
    expect(result.ok).toBe(true);
    expect(await store.listPending()).toEqual([pending]);
    expect((await store.readMeta()).cursor).toBe(3);
    expect((await store.readSnapshot()).coverage).toBe("full");
  });
});

describe("enhanced page coverage", () => {
  it("accepts source sequence holes and atomically resets a foreign generation from its first page", async () => {
    const store = createMemoryEventStore();
    await store.setOwner("owner");
    await seedCopy(store, { storeId: "old", cursor: 90 });
    await store.append([pending], await store.readMeta());
    const guard = await store.readSnapshot();
    const result = await store.applyRemotePage({
      guard,
      storeId: "new",
      since: 0,
      seq: 3,
      records: [{ seq: 3, event: old }],
    });
    expect(result.ok).toBe(true);
    expect(await store.listPending()).toEqual([]);
    expect(await storedEvents(store)).toEqual([old]);
    expect((await store.readMeta()).cursor).toBe(3);
    expect((await store.readSnapshot()).owner).toBe("owner");
    expect((await store.readSnapshot()).copyToken).not.toBe(guard.copyToken);
  });
  it("refuses a page that jumps past the locally known page boundary", async () => {
    const store = createMemoryEventStore();
    const guard = await store.readSnapshot();
    expect(
      await store.applyRemotePage({
        guard,
        storeId: "one",
        since: 2,
        seq: 3,
        records: [{ seq: 3, event: old }],
      }),
    ).toEqual({ ok: false, error: "history/rebuild-required" });
    expect((await store.readMeta()).cursor).toBe(0);
  });
});

describe("complete source identity proof", () => {
  it("does not drop a known resident tail ID when a pinned source page omits it", async () => {
    const store = createMemoryEventStore();
    await store.installBootstrap({
      guard: await store.readSnapshot(),
      checkpoint: base(),
      records: [{ seq: 5, event: pending }],
      seq: 5,
      syncVersion: 2,
    });
    const last = { ...pending, id: "01ARZ3NDEKTSV4RRFFQ69G5FAC" };
    expect(
      await store.installHistory({
        guard: await store.readSnapshot(),
        through: 7,
        sourceRecords: [
          { seq: 3, event: old },
          { seq: 7, event: last },
        ],
      }),
    ).toEqual({ ok: false, error: "history/incomplete" });
    expect((await store.readSnapshot()).coverage).toBe("checkpoint");
  });
  it("does not claim first-generation identity from an empty pull without advancing cursor", async () => {
    const store = createMemoryEventStore();
    const result = await store.applyRemotePage({
      guard: await store.readSnapshot(),
      storeId: "one",
      since: 0,
      seq: 0,
      records: [],
    });
    expect(result.ok).toBe(true);
    expect((await store.readMeta()).storeId).toBe("one");
  });
});

describe("coverage commit boundaries", () => {
  it("refuses an empty page that advances beyond its actual source boundary", () => {
    // The server ends a page at its last record: the tail's reader holds it to that, on the
    // records as sent, before any this build cannot read is left out.
    expect(readTailRecords([], { since: 0, seq: 7 })).toEqual({
      ok: false,
      error: "history/incomplete",
    });
    expect(readTailRecords([{ seq: 3, event: old }], { since: 0, seq: 7 })).toEqual({
      ok: false,
      error: "history/incomplete",
    });
  });
  it("takes a page that ends at a record this build cannot read, and moves the cursor past it", async () => {
    const records = readTailRecords(
      [
        { seq: 3, event: old },
        { seq: 7, event: { ...pending, type: "future.thing" } },
      ],
      { since: 0, seq: 7 },
    );
    expect(records).toEqual({ ok: true, value: [{ seq: 3, event: old }] });
    const store = createMemoryEventStore();
    const applied = await store.applyRemotePage({
      guard: await store.readMeta(),
      storeId: "one",
      since: 0,
      seq: 7,
      records: records.ok ? records.value : [],
    });
    expect(applied).toMatchObject({ ok: true, value: { cursor: 7, records: [{ seq: 3 }] } });
  });
  it("does not certify empty source as complete for an unreadable partial base", async () => {
    const store = createMemoryEventStore();
    const image = {
      ...(await store.readSnapshot()),
      coverage: "checkpoint" as const,
      checkpoint: null,
      cursor: 7,
    };
    const { historySnapshot } = await import("./checkpoint-store.ts");
    expect(historySnapshot(image, { guard: image, through: 7, sourceRecords: [] })).toEqual({
      ok: false,
      error: "history/incomplete",
    });
  });
  it("keeps full history when an older same-cursor bootstrap finishes after hydration", async () => {
    const store = createMemoryEventStore();
    await store.installBootstrap({
      guard: await store.readSnapshot(),
      checkpoint: base(),
      records: [],
      seq: 3,
      syncVersion: 2,
    });
    const guard = await store.readSnapshot();
    await store.installHistory({ guard, through: 3, sourceRecords: [{ seq: 3, event: old }] });
    await store.installBootstrap({
      guard,
      checkpoint: base(),
      records: [],
      seq: 3,
      syncVersion: 2,
    });
    expect((await store.readSnapshot()).coverage).toBe("full");
    expect(await storedEvents(store)).toEqual([old]);
  });
});

describe("guarded legacy acknowledgment", () => {
  it("does not acknowledge matching pending IDs in a copy claimed after the request", async () => {
    const store = createMemoryEventStore();
    await store.setOwner("old");
    await store.append([pending], await store.readMeta());
    const guard = await store.readSnapshot();
    await store.setOwner("new");
    await expect(store.markSynced([pending.id], guard)).rejects.toThrow("sync/copy-changed");
    expect(await store.listPending()).toEqual([pending]);
  });
});

describe("atomic legacy source pages", () => {
  it("commits canonical unsequenced envelopes, acknowledgments and cursor together", async () => {
    const store = createMemoryEventStore();
    await store.append([pending], await store.readMeta());
    const canonical = { ...pending, recordedAt: at(11) };
    expect(
      (
        await store.applyLegacyPage({
          guard: await store.readSnapshot(),
          storeId: "one",
          since: 0,
          seq: 7,
          events: [canonical],
        })
      ).ok,
    ).toBe(true);
    expect(await storedEvents(store)).toEqual([canonical]);
    expect(await store.listPending()).toEqual([]);
    expect((await store.readSnapshot()).records).toEqual([{ seq: null, event: canonical }]);
    expect((await store.readMeta()).cursor).toBe(7);
  });
  it("refuses a late full-source page after a foreign owner claims the copy", async () => {
    const store = createMemoryEventStore();
    const guard = await store.readSnapshot();
    await store.setOwner("other");
    expect(
      await store.applyLegacyPage({ guard, storeId: "one", since: 0, seq: 7, events: [old] }),
    ).toEqual({ ok: false, error: "sync/copy-changed" });
    expect(await storedEvents(store)).toEqual([]);
    expect((await store.readMeta()).cursor).toBe(0);
  });
});

describe("immutable source sequence identity", () => {
  it("refuses duplicate source IDs in an enhanced page", async () => {
    const store = createMemoryEventStore();
    expect(
      await store.applyRemotePage({
        guard: await store.readSnapshot(),
        storeId: "one",
        since: 0,
        seq: 7,
        records: [
          { seq: 3, event: old },
          { seq: 7, event: old },
        ],
      }),
    ).toEqual({ ok: false, error: "history/rebuild-required" });
  });
  it("does not lower an existing cursor within the same generation on bootstrap", async () => {
    const store = createMemoryEventStore();
    await seedCopy(store, { storeId: "one", cursor: 9 });
    const guard = await store.readSnapshot();
    expect(
      await store.installBootstrap({
        guard,
        checkpoint: base(),
        records: [],
        seq: 3,
        syncVersion: 2,
      }),
    ).toEqual({ ok: false, error: "history/rebuild-required" });
    expect((await store.readMeta()).cursor).toBe(9);
  });
  it("does not rewind a newer peer page during a local schema upgrade", async () => {
    const store = createMemoryEventStore();
    await seedCopy(store, { storeId: "one", cursor: 3 });
    const guard = await store.readSnapshot();
    await seedCopy(store, { cursor: 7 });
    expect(
      await store.applyLegacyPage({
        guard,
        storeId: "one",
        since: 0,
        seq: 0,
        events: [],
        syncVersion: 1,
      }),
    ).toEqual({ ok: false, error: "history/rebuild-required" });
    expect((await store.readMeta()).cursor).toBe(7);
  });
});

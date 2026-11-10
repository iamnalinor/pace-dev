import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { parseEvent } from "@pace/core";

import {
  createArchiveSet,
  readArchiveHistory,
  readHistoryPage,
} from "../src/user-store/archive-history.ts";
import { ArchiveRepository } from "../src/user-store/archive-repository.ts";
import { restoreArchiveSet } from "../src/user-store/archive-restore.ts";
import { ArchiveService } from "../src/user-store/archive-service.ts";
import { captureArchiveSource } from "../src/user-store/archive-source.ts";
import { addUsage } from "../src/user-store/cloud-data.ts";
import { memoryArchive } from "./archive-test-store.ts";
import { runInUserStore } from "./host.ts";

const NOW = "2026-11-06T12:00:00.000Z";
const stamped = (id: string, input: { type: string; payload: object; at: string }) => {
  const parsed = parseEvent({
    id: `auto:restore:${id}`,
    type: input.type,
    payload: input.payload,
    occurredAt: input.at,
    recordedAt: input.at,
    deviceId: "fixture",
    source: "app",
    precision: "exact",
  });
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

describe("isolated archive restore", () => {
  it("preserves allocated source cursors including a legitimately burned AUTOINCREMENT value", async () => {
    const source = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    const baseline = await runInUserStore(source, async (store, state) => {
      const insert = (id: string) =>
        state.storage.sql.exec(
          "INSERT INTO events (id,type,occurred_at,recorded_at,device_id,precision,source,payload) VALUES (?,'settings.updated','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','fixture','exact','app','{}') ON CONFLICT(id) DO NOTHING",
          id,
        );
      insert("auto:first");
      insert("auto:first");
      insert("auto:last");
      const captured = captureArchiveSource(store.ctx.storage);
      expect(
        captured.records.filter((record) => record.kind === "event").map((record) => record.seq),
      ).toEqual([1, 3]);
      const set = await createArchiveSet({
        owner: "source-owner",
        storeId: await store.storeId(),
        sourceSchemaTag: "test",
        source: captured,
        selected: [],
      });
      return { captured, set };
    });
    const target = env.USER_STORE.get(env.USER_STORE.idFromName(`restore:${crypto.randomUUID()}`));
    await runInUserStore(target, async (store) => {
      const result = await restoreArchiveSet({
        set: baseline.set,
        retainedComplement: baseline.captured.records,
        archive: memoryArchive().store,
        target: {
          storage: store.ctx.storage,
          db: store.db,
          owner: store.ctx.id.name ?? "",
          isolated: true,
        },
        now: NOW,
      });
      expect(result.ok).toBe(true);
      expect(captureArchiveSource(store.ctx.storage)).toEqual(baseline.captured);
    });
  });
});

it("rejects an isolated target polluted by a stale raw revision without changing its generation", async () => {
  const target = env.USER_STORE.get(env.USER_STORE.idFromName(`restore:${crypto.randomUUID()}`));
  await runInUserStore(target, async (store, state) => {
    const generation = await store.storeId();
    state.storage.sql.exec("INSERT INTO _history_raw_state (id,revision) VALUES (1,5)");
    const set = await createArchiveSet({
      owner: "source",
      storeId: "source-generation",
      sourceSchemaTag: "test",
      source: { sourceHighSeq: 0, rawRevision: 0, records: [] },
      selected: [],
    });
    expect(
      await restoreArchiveSet({
        set,
        retainedComplement: [],
        archive: memoryArchive().store,
        target: {
          storage: store.ctx.storage,
          db: store.db,
          owner: store.ctx.id.name ?? "",
          isolated: true,
        },
        now: NOW,
      }),
    ).toEqual({ ok: false, error: "archive/invalid" });
    expect(await store.storeId()).toBe(generation);
  });
});

it("restores selected latest monthly copies plus sparse hot complement into an isolated actor", async () => {
  const bucket = memoryArchive();
  const source = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  const baseline = await runInUserStore(source, async (store, state) => {
    const events = [
      stamped("settings", {
        type: "settings.updated",
        payload: { timezone: "UTC", digestWindows: [] },
        at: "2026-01-01T00:00:00.000Z",
      }),
      stamped("create", {
        type: "task.created",
        payload: { taskId: "open", title: "Old open task", presetId: "personal" },
        at: "2026-01-02T00:00:00.000Z",
      }),
      stamped("future-revoke", {
        type: "event.revoked",
        payload: { targetId: "auto:restore:future" },
        at: "2026-02-01T00:00:00.000Z",
      }),
      stamped("z", {
        type: "settings.updated",
        payload: { language: "ru" },
        at: "2026-03-01T00:00:00.000Z",
      }),
      stamped("a", {
        type: "settings.updated",
        payload: { language: "en" },
        at: "2026-03-01T00:00:00.000Z",
      }),
      stamped("future", {
        type: "task.created",
        payload: { taskId: "future", title: "Revoked before arrival", presetId: "personal" },
        at: "2026-04-01T00:00:00.000Z",
      }),
      stamped("amend", {
        type: "event.amended",
        payload: { targetId: "auto:restore:create", patch: { title: "Temporary title" } },
        at: "2026-05-01T00:00:00.000Z",
      }),
      stamped("undo-amend", {
        type: "event.revoked",
        payload: { targetId: "auto:restore:amend" },
        at: "2026-06-01T00:00:00.000Z",
      }),
      stamped("start", {
        type: "activity.started",
        payload: { activityId: "reading", label: "Reading", category: "chores", taskId: "open" },
        at: "2026-01-03T09:00:00.000Z",
      }),
      stamped("stop", {
        type: "activity.stopped",
        payload: { activityId: "reading" },
        at: "2026-01-03T10:00:00.000Z",
      }),
    ];
    for (const event of events) {
      state.storage.sql.exec(
        "INSERT INTO events (id,type,occurred_at,recorded_at,device_id,precision,source,payload) VALUES (?,?,?,?,?,?,?,?)",
        event.id,
        event.type,
        event.occurredAt,
        event.recordedAt,
        event.deviceId,
        event.precision,
        event.source,
        JSON.stringify(event.payload),
      );
    }
    const read = await store.read(NOW);
    expect(read.state.settings.language).toBe("ru");
    expect(read.state.tasks.byId["future"]).toBeUndefined();
    const upload = {
      deviceId: "phone",
      deviceName: "Original phone",
      isPhone: true,
      until: NOW,
      sessions: [{ app: "Reader", startAt: "2026-01-03T10:00:00Z", endAt: "2026-01-03T11:00:00Z" }],
      uses: [{ startAt: "2026-01-03T10:00:00Z", endAt: "2026-01-03T11:00:00Z" }],
    };
    await addUsage({ storage: store.ctx.storage, hasArchive: true }, upload, NOW);
    const archive = new ArchiveService({
      storage: store.ctx.storage,
      archive: bucket.store,
      owner: store.ctx.id.name,
      sourceSchemaTag: "test",
      canWrite: () => true,
    });
    const first = await archive.captureArchiveMonth({
      month: "2026-01",
      now: NOW,
      timezone: "UTC",
    });
    if (!first.ok) {
      throw new Error(first.error);
    }
    expect((await archive.resumeArchiveOperation(first.value.id, NOW)).ok).toBe(true);
    const [session] = upload.sessions;
    const [use] = upload.uses;
    if (session === undefined || use === undefined) {
      throw new Error("empty raw fixture");
    }
    await addUsage(
      { storage: store.ctx.storage, hasArchive: true },
      {
        ...upload,
        deviceName: "Renamed phone",
        sessions: [{ ...session, endAt: "2026-01-03T11:30:00Z" }],
        uses: [{ ...use, endAt: "2026-01-03T11:30:00Z" }],
      },
      NOW,
    );
    const latest = await archive.captureArchiveMonth({
      month: "2026-01",
      now: NOW,
      timezone: "UTC",
    });
    if (!latest.ok) {
      throw new Error(latest.error);
    }
    expect((await archive.resumeArchiveOperation(latest.value.id, NOW)).ok).toBe(true);
    expect(bucket.objects.size).toBe(4);
    const selected = new ArchiveRepository(store.ctx.storage).load(latest.value.id);
    if (!selected.ok || selected.value === undefined) {
      throw new Error("missing committed fixture");
    }
    const captured = captureArchiveSource(store.ctx.storage);
    const set = await createArchiveSet({
      owner: store.ctx.id.name ?? "",
      storeId: await store.storeId(),
      sourceSchemaTag: "test",
      source: captured,
      selected: [selected.value],
    });
    const complement = captured.records.filter(
      (record) => record.kind === "event" && !record.row.occurredAt.startsWith("2026-01"),
    );
    const overlap = captured.records.find((record) => record.kind === "event" && record.seq === 2);
    if (overlap !== undefined) {
      complement.push(overlap);
    }
    expect(
      (await readArchiveHistory({ set, archive: bucket.store, retainedComplement: complement })).ok,
    ).toBe(true);
    expect(
      await readArchiveHistory({
        set,
        archive: bucket.store,
        retainedComplement: complement.filter(
          (record) => record.kind !== "event" || record.seq !== 3,
        ),
      }),
    ).toMatchObject({ ok: false, error: "archive/integrity" });
    const firstPage = await readHistoryPage({
      set,
      archive: bucket.store,
      retainedComplement: complement,
      after: 0,
      through: 10,
      limit: 3,
    });
    expect(firstPage).toMatchObject({ ok: true, value: { seq: 3, more: true } });
    const page = await store.list(0, 100);
    expect(page.events).toHaveLength(10);
    expect(await store.list(page.seq, 100)).toMatchObject({
      events: [],
      seq: page.seq,
      more: false,
    });
    return {
      captured,
      set,
      complement,
      state: read.state,
      log: events,
      aggregates: state.storage.sql
        .exec("SELECT * FROM usage_daily_apps ORDER BY day,device_id,app")
        .toArray(),
    };
  });
  const target = env.USER_STORE.get(env.USER_STORE.idFromName(`restore:${crypto.randomUUID()}`));
  const restored = await runInUserStore(target, async (store, state) => {
    const result = await restoreArchiveSet({
      set: baseline.set,
      retainedComplement: baseline.complement,
      archive: bucket.store,
      target: {
        storage: store.ctx.storage,
        db: store.db,
        owner: store.ctx.id.name ?? "",
        isolated: true,
      },
      now: NOW,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.value.state).toEqual(baseline.state);
    expect(captureArchiveSource(store.ctx.storage)).toEqual(baseline.captured);
    expect(
      state.storage.sql.exec("SELECT * FROM usage_daily_apps ORDER BY day,device_id,app").toArray(),
    ).toEqual(baseline.aggregates);
    expect(state.storage.sql.exec("SELECT * FROM notifications").toArray()).toHaveLength(0);
    const log = (await store.list(0, 100)).events.map((row) => {
      const parsed = parseEvent(row);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      return parsed.value;
    });
    return { state: result.value.state, log };
  });
  expect(restored).toEqual({ state: baseline.state, log: baseline.log });
}, 60_000);

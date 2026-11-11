import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { type Event, parseEvent } from "@pace/core";

import {
  actorDatabase,
  actorStorage,
  migrateActor,
} from "../src/platform/cloudflare/actor-storage.ts";
import { guardSql } from "../src/user-store/analytics.ts";
import { CheckpointRepository } from "../src/user-store/checkpoint-repository.ts";
import { insertNew } from "../src/user-store/log-queries.ts";
import { StateCache } from "../src/user-store/state-cache.ts";
import { meterSql } from "./helpers.ts";
import { runInUserStore, UserStore } from "./host.ts";

const NOW = "2026-11-06T12:00:00.000Z";
const OLD = "2025-01-01T00:00:00.000Z";
const event = (
  id: string,
  type: string,
  { payload, occurredAt = OLD }: { readonly payload: object; readonly occurredAt?: string },
): Event => {
  const parsed = parseEvent({
    id: `auto:checkpoint:${id}`,
    type,
    payload,
    occurredAt,
    recordedAt: occurredAt,
    deviceId: "fixture",
    precision: "exact",
    source: "app",
  });
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

describe("checkpoint state cache", () => {
  it("reconstructs an old open task on cold restart from snapshot plus a sequenced recent tail", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (store, state) => {
      const db = actorDatabase(state.storage);
      const storage = actorStorage(state.storage);
      const records = [
        event("old", "task.created", {
          payload: { taskId: "old", title: "Still open", presetId: "personal" },
        }),
        event("recent", "settings.updated", {
          payload: { language: "ru" },
          occurredAt: "2026-11-05T12:00:00.000Z",
        }),
      ];
      await insertNew(db, records, new Set());
      const options = {
        build: "checkpoint-cache-test",
        db,
        storage,
        isNamed: true,
        checkpointMode: "active" as const,
        now: () => NOW,
      };
      const initial = await new StateCache(options).current();
      expect(initial.state.tasks.byId["old"]?.title).toBe("Still open");
      expect(
        state.storage.sql.exec("SELECT covered_seq FROM history_checkpoint").toArray(),
      ).toEqual([{ covered_seq: 1 }]);
      const cold = await new StateCache(options).current();
      expect(cold).toEqual(initial);
      expect(cold.seq).toBe(2);
      expect(await store.countEvents()).toBe(2);
    });
  });

  it("knows on a cold restart from a checkpoint which events are revoked, so none is revoked twice", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (_store, state) => {
      const db = actorDatabase(state.storage);
      const created = event("made", "task.created", {
        payload: { taskId: "made", title: "Undone long ago", presetId: "personal" },
      });
      const revoked = event("undo", "event.revoked", { payload: { targetId: created.id } });
      const recent = event("recent", "settings.updated", {
        payload: { language: "ru" },
        occurredAt: "2026-11-05T12:00:00.000Z",
      });
      await insertNew(db, [created, revoked, recent], new Set());
      const options = {
        build: "checkpoint-cache-revoked",
        db,
        storage: actorStorage(state.storage),
        isNamed: true,
        checkpointMode: "active" as const,
        now: () => NOW,
      };
      const initial = await new StateCache(options).current();
      const cold = await new StateCache(options).current();
      expect(initial.revoked).toEqual(new Set([created.id]));
      expect(cold.revoked).toEqual(new Set([created.id]));
    });
  });
});

describe("checkpoint privacy", () => {
  it.each(["history_checkpoint", "history_checkpoint_chunks"])(
    "keeps %s outside SQL analytics",
    (table) => {
      expect(guardSql(`SELECT * FROM ${table}`)).toMatchObject({
        ok: false,
        error: { code: "sql/forbidden" },
      });
    },
  );
});

const created = event("old-task", "task.created", {
  payload: {
    taskId: "old",
    title: "Original",
    presetId: "personal",
  },
});
const amendment = event("amendment", "event.amended", {
  payload: {
    targetId: created.id,
    patch: { title: "Amended" },
  },
});
const cases = [
  {
    name: "amendment of an old task",
    base: [created],
    tail: [
      event("new-amend", "event.amended", {
        payload: { targetId: created.id, patch: { title: "Corrected" } },
        occurredAt: NOW,
      }),
    ],
  },
  {
    name: "revocation of an old task",
    base: [created],
    tail: [
      event("revoke", "event.revoked", { payload: { targetId: created.id }, occurredAt: NOW }),
    ],
  },
  {
    name: "correction of a correction",
    base: [created, amendment],
    tail: [
      event("undo-amend", "event.revoked", {
        payload: { targetId: amendment.id },
        occurredAt: NOW,
      }),
    ],
  },
  {
    name: "base correction fulfilled by a later target",
    base: [
      event("future-revoke", "event.revoked", { payload: { targetId: "auto:checkpoint:future" } }),
    ],
    tail: [
      event("future", "task.created", {
        payload: { taskId: "future", title: "Revoked on arrival", presetId: "personal" },
        occurredAt: NOW,
      }),
    ],
  },
  {
    name: "retroactive arrival after the cursor prefix",
    base: [event("language", "settings.updated", { payload: { language: "ru" } })],
    tail: [
      event("retro", "settings.updated", {
        payload: { language: "en" },
        occurredAt: "2024-12-01T00:00:00.000Z",
      }),
    ],
  },
  {
    name: "lower same-time canonical id",
    base: [event("z", "settings.updated", { payload: { language: "ru" } })],
    tail: [event("a", "settings.updated", { payload: { language: "en" } })],
  },
] as const;

describe("retained-source checkpoint fallback", () => {
  it.each(cases.flatMap((item) => (["active", "off"] as const).map((mode) => ({ ...item, mode }))))(
    "matches full replay after $name, cold and warm ($mode)",
    async ({ base, tail, mode }) => {
      const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
      await runInUserStore(stub, async (_store, state) => {
        const db = actorDatabase(state.storage);
        const storage = actorStorage(state.storage);
        const options = {
          build: "checkpoint-cache-test",
          db,
          storage,
          isNamed: true,
          checkpointMode: mode,
          now: () => NOW,
        };
        await insertNew(db, base, new Set());
        const warm = new StateCache(options);
        const before = await warm.current();
        const accelerated = new StateCache(options);
        const beforeAccelerated = await accelerated.current();
        await insertNew(db, tail, before.ids);
        const seq = base.length + tail.length;
        await warm.fold(before, tail, seq);
        await accelerated.fold(beforeAccelerated, tail, seq);
        const oracle = await new StateCache({ ...options, checkpointMode: "off" }).current();
        expect(await warm.current()).toEqual(oracle);
        expect(await accelerated.current()).toEqual(oracle);
        expect(await new StateCache(options).current()).toEqual(oracle);
        expect(await warm.log()).toHaveLength(seq);
      });
    },
  );

  it("refuses a prefix with a schema-unknown raw row while full replay remains tolerant", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (_store, state) => {
      const db = actorDatabase(state.storage);
      await insertNew(db, [created], new Set());
      state.storage.sql.exec(
        "INSERT INTO events (id,type,occurred_at,recorded_at,device_id,precision,source,payload) VALUES ('auto:unknown', 'future.event', ?, ?, 'fixture', 'exact', 'app', '{}')",
        OLD,
        OLD,
      );
      const current = await new StateCache({
        build: "checkpoint-cache-test",
        db,
        storage: actorStorage(state.storage),
        isNamed: true,
        checkpointMode: "active",
        now: () => NOW,
      }).current();
      expect(current.state.tasks.byId["old"]?.title).toBe("Original");
      expect(current.seq).toBe(2);
      expect(state.storage.sql.exec("SELECT * FROM history_checkpoint").toArray()).toHaveLength(0);
    });
  });

  it("keeps late backdates in the cursor tail after the first recent event", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (_store, state) => {
      const db = actorDatabase(state.storage);
      await insertNew(
        db,
        [
          created,
          event("recent", "settings.updated", { payload: { language: "ru" }, occurredAt: NOW }),
          event("late-old", "settings.updated", { payload: { timezone: "UTC" } }),
        ],
        new Set(),
      );
      const cache = new StateCache({
        build: "checkpoint-cache-test",
        db,
        storage: actorStorage(state.storage),
        isNamed: true,
        checkpointMode: "active",
        now: () => NOW,
      });
      await cache.current();
      expect(
        state.storage.sql.exec("SELECT covered_seq FROM history_checkpoint").toArray(),
      ).toEqual([{ covered_seq: 1 }]);
      expect((await cache.log()).map((item) => item.id)).toEqual([
        created.id,
        "auto:checkpoint:recent",
        "auto:checkpoint:late-old",
      ]);
    });
  });

  it("advances the whole-day prefix once without rewriting identical snapshots", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (_store, state) => {
      const db = actorDatabase(state.storage);
      await insertNew(
        db,
        [
          event("zone", "settings.updated", { payload: { timezone: "UTC" } }),
          event("boundary", "settings.updated", {
            payload: { language: "ru" },
            occurredAt: "2026-10-07T12:00:00.000Z",
          }),
          event("recent", "settings.updated", { payload: { language: "en" }, occurredAt: NOW }),
        ],
        new Set(),
      );
      let now = NOW;
      const cache = new StateCache({
        build: "checkpoint-cache-test",
        db,
        storage: actorStorage(state.storage),
        isNamed: true,
        checkpointMode: "active",
        now: () => now,
      });
      await cache.current();
      expect(
        state.storage.sql.exec("SELECT covered_seq FROM history_checkpoint").toArray(),
      ).toEqual([{ covered_seq: 1 }]);
      const meter = meterSql(state.storage);
      await cache.current();
      expect(meter.cost().rowsWritten).toBe(0);
      meter.restore();
      now = "2026-11-07T12:00:00.000Z";
      await cache.current();
      expect(
        state.storage.sql.exec("SELECT covered_seq FROM history_checkpoint").toArray(),
      ).toEqual([{ covered_seq: 2 }]);
    });
  });

  it("uses full replay and a fixed diagnostic when a structurally valid shadow disagrees", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (store, state) => {
      const db = actorDatabase(state.storage);
      const options = {
        build: "checkpoint-cache-test",
        db,
        storage: actorStorage(state.storage),
        isNamed: true,
        checkpointMode: "active" as const,
        now: () => NOW,
      };
      await insertNew(db, [created], new Set());
      const oracle = await new StateCache(options).current();
      const repository = new CheckpointRepository(options.storage);
      const saved = await repository.read({ build: options.build, storeId: await store.storeId() });
      expect(saved.kind).toBe("valid");
      if (saved.kind !== "valid") {
        throw new Error("missing fixture checkpoint");
      }
      const altered = {
        ...saved.checkpoint,
        state: {
          ...saved.checkpoint.state,
          settings: { ...saved.checkpoint.state.settings, language: "ru" as const },
        },
      };
      expect(await repository.publish(altered, 1)).toBe(true);
      const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        expect(await new StateCache({ ...options, checkpointMode: "shadow" }).current()).toEqual(
          oracle,
        );
        expect(errors).toHaveBeenCalledOnce();
        const diagnostic: unknown = errors.mock.calls[0]?.[0];
        expect(typeof diagnostic).toBe("string");
        expect(JSON.parse(String(diagnostic))).toMatchObject({
          message: "history/checkpoint-shadow-mismatch",
        });
        expect(String(diagnostic)).not.toContain("Original");
      } finally {
        errors.mockRestore();
      }
      expect(
        await repository.read({ build: options.build, storeId: await store.storeId() }),
      ).toEqual(saved);
    });
  });

  it("leaves mode off by default and bypasses unversioned build snapshots", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (_store, state) => {
      const db = actorDatabase(state.storage);
      await insertNew(db, [created], new Set());
      for (const extra of [
        { isNamed: true },
        { isNamed: false, checkpointMode: "active" as const },
      ]) {
        await new StateCache({
          build: "dev",
          db,
          storage: actorStorage(state.storage),
          now: () => NOW,
          ...extra,
        }).current();
      }
      expect(state.storage.sql.exec("SELECT * FROM history_checkpoint").toArray()).toHaveLength(0);
    });
  });
});

describe("checkpoint actor lifecycle", () => {
  it("keeps checkpoint state through repeated migrations and clears it with a wipe", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (store, state) => {
      const storage = actorStorage(state.storage);
      const db = actorDatabase(state.storage);
      await insertNew(db, [created], new Set());
      await new StateCache({
        build: "checkpoint-cache-test",
        db,
        storage,
        isNamed: true,
        checkpointMode: "active",
        now: () => NOW,
      }).current();
      const id = await store.storeId();
      await migrateActor(state.storage);
      await migrateActor(state.storage);
      expect(
        await new CheckpointRepository(storage).read({
          build: "checkpoint-cache-test",
          storeId: id,
        }),
      ).toMatchObject({ kind: "valid" });
      expect(
        (await store.describeSchema()).some((table) => table.name.includes("history_checkpoint")),
      ).toBe(false);
      await store.wipe();
      expect(await store.storeId()).not.toBe(id);
      expect(
        await new CheckpointRepository(storage).read({
          build: "checkpoint-cache-test",
          storeId: id,
        }),
      ).toEqual({ kind: "absent" });
      expect(await store.countEvents()).toBe(0);
    });
  });
});

describe("checkpoint composition and incoming correction evidence", () => {
  it("passes actor mode configuration through to durable checkpoint construction", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (_store, state) => {
      await insertNew(actorDatabase(state.storage), [created], new Set());
      const configured = new UserStore(state, {
        ...env,
        PACE_VERSION: "checkpoint-composition",
        PACE_HISTORY_CHECKPOINT_MODE: "active",
      });
      expect((await configured.read(NOW)).state.tasks.byId["old"]?.title).toBe("Original");
      expect(
        state.storage.sql.exec("SELECT covered_seq FROM history_checkpoint").toArray(),
      ).toEqual([{ covered_seq: 1 }]);
    });
  });

  it("retains targets from a correction appended after the cache was already warm", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (_store, state) => {
      const db = actorDatabase(state.storage);
      const cache = new StateCache({
        build: "checkpoint-cache-test",
        db,
        storage: actorStorage(state.storage),
        isNamed: true,
        now: () => NOW,
      });
      const correction = event("late-correction", "event.revoked", {
        payload: {
          targetId: "auto:checkpoint:later-target",
        },
      });
      const target = event("later-target", "task.created", {
        payload: { taskId: "future", title: "Never visible", presetId: "personal" },
        occurredAt: NOW,
      });
      let before = await cache.current();
      for (const [index, item] of [correction, target].entries()) {
        await insertNew(db, [item], before.ids);
        await cache.fold(before, [item], index + 1);
        before = await cache.current();
      }
      expect(before.state.tasks.byId["future"]).toBeUndefined();
      expect(before.lastAppliedOccurredAt).toBeNull();
      expect(before.ids.size).toBe(2);
    });
  });
});

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { parseCheckpoint, parseEvent } from "@pace/core";

import { actorDatabase, actorStorage } from "../src/platform/cloudflare/actor-storage.ts";
import { CheckpointRepository } from "../src/user-store/checkpoint-repository.ts";
import { HistorySync } from "../src/user-store/history-sync.ts";
import { insertNew } from "../src/user-store/log-queries.ts";
import { SERVER_TZ } from "../src/user-store/notifier.ts";
import { StateCache } from "../src/user-store/state-cache.ts";
import { runInUserStore, UserStore } from "./host.ts";

const NOW = "2026-11-06T12:00:00.000Z";
const stamped = (id: string, input: { type: string; payload: object; at: string }) => {
  const result = parseEvent({
    id,
    type: input.type,
    payload: input.payload,
    occurredAt: input.at,
    recordedAt: input.at,
    deviceId: "fixture",
    precision: "exact",
    source: "app",
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};
describe("fixed high-water checkpoint bootstrap", () => {
  it("replaces an unsafe tail through H and never downgrades coverage during age-based advancement", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (store, state) => {
      const db = actorDatabase(state.storage);
      const storage = actorStorage(state.storage);
      const old = stamped("auto:old-setting", {
        type: "settings.updated",
        payload: { language: "ru", timezone: "UTC" },
        at: "2026-01-01T00:00:00.000Z",
      });
      const correction = stamped("auto:new-correction", {
        type: "event.amended",
        payload: { targetId: old.id, patch: { language: "en" } },
        at: "2026-11-05T00:00:00.000Z",
      });
      await insertNew(db, [old, correction], new Set());
      let now = NOW;
      const cache = new StateCache({
        db,
        storage,
        build: "bootstrap-test",
        isNamed: true,
        checkpointMode: "active",
        now: () => now,
      });
      const sync = new HistorySync({
        db,
        storage,
        build: "bootstrap-test",
        isEnabled: true,
        current: async () => await cache.current(),
        checkpointPublished: (checkpoint) => {
          cache.checkpointPublished(checkpoint);
        },
        now: () => now,
      });
      const result = await sync.bootstrap(1);
      expect(result.kind).toBe("checkpoint");
      if (result.kind !== "checkpoint") {
        throw new Error("missing checkpoint");
      }
      expect(result).toMatchObject({ throughSeq: 2, seq: 2, more: false, records: [] });
      const checkpoint = parseCheckpoint(JSON.parse(result.checkpointJson));
      expect(checkpoint).toMatchObject({
        ok: true,
        value: { coveredSeq: 2, state: { settings: { language: "en" } } },
      });
      now = "2026-11-07T12:00:00.000Z";
      await cache.current();
      expect(
        await new CheckpointRepository(storage).read({
          build: "bootstrap-test",
          storeId: await store.storeId(),
        }),
      ).toMatchObject({ kind: "valid", checkpoint: { coveredSeq: 2 } });
      expect(
        await sync.pull({ since: 2, limit: 1, checkpointVersion: 1, storeId: result.storeId }),
      ).toMatchObject({ ok: true, value: { records: [], more: false, seq: 2 } });
    });
  });
});

it("pins safe suffix pages to bootstrap H and settles after later writes", async () => {
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  await runInUserStore(stub, async (store, state) => {
    const db = actorDatabase(state.storage);
    const storage = actorStorage(state.storage);
    const old = stamped("auto:safe-old", {
      type: "settings.updated",
      payload: { timezone: "UTC" },
      at: "2026-01-01T00:00:00.000Z",
    });
    const tail = [1, 2, 3].map((index) =>
      stamped(`auto:safe-${String(index)}`, {
        type: "settings.updated",
        payload: { language: "ru" },
        at: `2026-11-0${String(index)}T00:00:00.000Z`,
      }),
    );
    await insertNew(db, [old, ...tail], new Set());
    const cache = new StateCache({
      db,
      storage,
      build: "safe-bootstrap",
      isNamed: true,
      checkpointMode: "active",
      now: () => NOW,
    });
    const sync = new HistorySync({
      db,
      storage,
      build: "safe-bootstrap",
      isEnabled: true,
      current: async () => await cache.current(),
      checkpointPublished: (checkpoint) => {
        cache.checkpointPublished(checkpoint);
      },
      now: () => NOW,
    });
    const bootstrap = await sync.bootstrap(1);
    expect(bootstrap).toMatchObject({
      kind: "checkpoint",
      throughSeq: 4,
      seq: 2,
      more: true,
      records: [{ seq: 2, event: { id: tail[0]?.id } }],
    });
    const storeId = await store.storeId();
    const late = stamped("auto:after-capture", {
      type: "settings.updated",
      payload: { language: "en" },
      at: NOW,
    });
    await insertNew(db, [late], new Set());
    expect(
      await sync.pull({ since: 2, limit: 10, checkpointVersion: 1, storeId, through: 4 }),
    ).toMatchObject({
      ok: true,
      value: { seq: 4, more: false, records: [{ seq: 3 }, { seq: 4 }] },
    });
    expect(await sync.pull({ since: 4, limit: 10, checkpointVersion: 1, storeId })).toMatchObject({
      ok: true,
      value: { seq: 5, records: [{ seq: 5, event: { id: late.id } }] },
    });
    expect(await sync.pull({ since: 5, limit: 10, checkpointVersion: 1, storeId })).toMatchObject({
      ok: true,
      value: { seq: 5, more: false, records: [] },
    });
  });
});

it("returns source rather than repeatedly demanding an impossible unknown-schema bootstrap", async () => {
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  await runInUserStore(stub, async (store, state) => {
    const db = actorDatabase(state.storage);
    const storage = actorStorage(state.storage);
    await insertNew(
      db,
      [
        stamped("auto:known", {
          type: "settings.updated",
          payload: { timezone: "UTC" },
          at: "2026-01-01T00:00:00.000Z",
        }),
      ],
      new Set(),
    );
    const cache = new StateCache({
      db,
      storage,
      build: "unknown-bootstrap",
      isNamed: true,
      checkpointMode: "active",
      now: () => NOW,
    });
    await cache.current();
    state.storage.sql.exec(
      "INSERT INTO events (id,type,occurred_at,recorded_at,device_id,precision,source,payload) VALUES ('auto:future-schema','future.type',?,?, 'fixture','exact','app','{}')",
      NOW,
      NOW,
    );
    const sync = new HistorySync({
      db,
      storage,
      build: "unknown-bootstrap",
      isEnabled: true,
      current: async () => await cache.current(),
      checkpointPublished: (checkpoint) => {
        cache.checkpointPublished(checkpoint);
      },
      now: () => NOW,
    });
    expect(await sync.bootstrap(10)).toEqual({ kind: "source", storeId: await store.storeId() });
    const pulled = await sync.pull({
      since: 0,
      limit: 10,
      checkpointVersion: 1,
      storeId: await store.storeId(),
    });
    expect(pulled).toMatchObject({
      ok: true,
      value: { seq: 2, records: [{ seq: 1 }, { seq: 2 }], more: false },
    });
    expect(pulled.ok && pulled.value.bootstrapRequired).toBeUndefined();
    expect(await store.countEvents()).toBe(2);
  });
});

it("builds an eligible checkpoint after a warm empty actor receives old source on the same day", async () => {
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  await runInUserStore(stub, async (_store, state) => {
    const actor = new UserStore(state, {
      ...env,
      PACE_VERSION: "warm-empty-bootstrap",
      PACE_HISTORY_CHECKPOINT_MODE: "active",
    });
    await actor.ready;
    expect((await actor.read(NOW)).seq).toBe(0);
    const old = stamped("auto:warm-old", {
      type: "settings.updated",
      payload: { language: "ru", timezone: SERVER_TZ },
      at: "2026-01-01T00:00:00.000Z",
    });
    expect(await actor.append([old], { now: NOW })).toMatchObject({ accepted: [old.id], seq: 1 });
    const bootstrap = await actor.bootstrap(10);
    expect(bootstrap.kind).toBe("checkpoint");
    if (bootstrap.kind !== "checkpoint") {
      throw new Error("warm old source did not publish a checkpoint");
    }
    expect(parseCheckpoint(JSON.parse(bootstrap.checkpointJson))).toMatchObject({
      ok: true,
      value: { coveredSeq: 1, state: { settings: { language: "ru" } } },
    });
  });
});

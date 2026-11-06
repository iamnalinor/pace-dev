import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { actorStorage, migrateActor } from "../src/platform/cloudflare/actor-storage.ts";
import { cloudflareBindings } from "../src/platform/cloudflare/bindings.ts";
import { prepareAccountCleanup } from "../src/shared/account-cleanup-repository.ts";
import { CleanupFence } from "../src/user-store/cleanup-fence.ts";
import { runInUserStore } from "./host.ts";

describe("actor cleanup fence", () => {
  it("blocks source authority before archive deletion and binds the fence to a pending owner operation", async () => {
    const owner = crypto.randomUUID();
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(owner));
    await runInUserStore(stub, async (store) => {
      const db = cloudflareBindings(env).DB;
      const operationId = crypto.randomUUID();
      expect(
        (
          await prepareAccountCleanup(db, {
            operationId,
            userId: owner,
            action: "wipe",
            now: new Date(),
          })
        ).ok,
      ).toBe(true);
      const fence = new CleanupFence({
        storage: store.ctx.storage,
        db,
        owner,
        migrate: async () => undefined,
        hasArchive: false,
      });
      expect(await fence.begin(operationId)).toEqual({
        ok: true,
        value: { sourceStoreId: await store.storeId(), archiveRequired: false },
      });
      expect(fence.canWrite()).toBe(false);
      expect(await store.ctx.storage.get("cleanup:fence")).toBe(operationId);
    });
  });
});

describe("warm cleanup terminal reconciliation", () => {
  it("releases a live actor when the coordinator completed before finishCleanup could run", async () => {
    const owner = crypto.randomUUID();
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(owner));
    await runInUserStore(stub, async (store) => {
      const db = cloudflareBindings(env).DB;
      const operationId = crypto.randomUUID();
      await prepareAccountCleanup(db, {
        operationId,
        userId: owner,
        action: "wipe",
        now: new Date(),
      });
      const fence = new CleanupFence({
        storage: store.ctx.storage,
        db,
        owner,
        migrate: async () => undefined,
        hasArchive: false,
      });
      await fence.open();
      expect((await fence.begin(operationId)).ok).toBe(true);
      await env.DB.prepare("UPDATE account_cleanup_operations SET stage='complete' WHERE id=?")
        .bind(operationId)
        .run();
      await fence.assertWritable();
      expect(fence.canWrite()).toBe(true);
      expect(await store.ctx.storage.get("cleanup:fence")).toBeUndefined();
    });
  });
});

it("restores a reset fence before readiness and never wipes an already advanced generation again", async () => {
  const owner = crypto.randomUUID();
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(owner));
  await runInUserStore(stub, async (store, state) => {
    const db = cloudflareBindings(env).DB;
    const operationId = crypto.randomUUID();
    const prepared = await prepareAccountCleanup(db, {
      operationId,
      userId: owner,
      action: "wipe",
      now: new Date(),
    });
    if (!prepared.ok) {
      throw new Error(prepared.error);
    }
    const old = await store.storeId();
    await env.DB.prepare(
      "UPDATE account_cleanup_operations SET stage='archives-cleared',source_store_id=? WHERE id=?",
    )
      .bind(old, operationId)
      .run();
    await state.storage.deleteAll();
    const storage = actorStorage(state.storage);
    const fencesAtReadiness: unknown[] = [];
    const ordered = {
      ...storage,
      put: async (key: string, value: unknown) => {
        if (key === "epoch") {
          fencesAtReadiness.push(await storage.get("cleanup:fence"));
        }
        await storage.put(key, value);
      },
    };
    const fence = new CleanupFence({
      storage: ordered,
      db,
      owner,
      migrate: async () => {
        await migrateActor(state.storage);
      },
      hasArchive: false,
    });
    await fence.open();
    expect(fencesAtReadiness).toEqual([operationId]);
    expect(await storage.get("storeId")).toBe(prepared.value.nextStoreId);
    expect(fence.canWrite()).toBe(false);
    state.storage.sql.exec(
      "INSERT INTO events (id,type,occurred_at,recorded_at,device_id,precision,source,payload) VALUES ('auto:new-generation','settings.updated','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','fixture','exact','app','{}')",
    );
    expect(await fence.reset({ operationId, expectedStoreId: old })).toEqual({
      ok: true,
      value: { storeId: prepared.value.nextStoreId },
    });
    expect(state.storage.sql.exec("SELECT id FROM events").toArray()).toEqual([
      { id: "auto:new-generation" },
    ]);
  });
});

it("keeps an initial unready source distinct from the journal's future reset generation", async () => {
  const owner = crypto.randomUUID();
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(owner));
  await runInUserStore(stub, async (_store, state) => {
    const db = cloudflareBindings(env).DB;
    const prepared = await prepareAccountCleanup(db, {
      operationId: crypto.randomUUID(),
      userId: owner,
      action: "wipe",
      now: new Date(),
    });
    if (!prepared.ok) {
      throw new Error(prepared.error);
    }
    await state.storage.deleteAll();
    const fence = new CleanupFence({
      storage: actorStorage(state.storage),
      db,
      owner,
      migrate: async () => {
        await migrateActor(state.storage);
      },
      hasArchive: false,
    });
    await fence.open();
    expect(await state.storage.get("storeId")).not.toBe(prepared.value.nextStoreId);
    expect(await state.storage.get("cleanup:fence")).toBe(prepared.value.id);
    expect(await state.storage.get("epoch")).toBe(2);
  });
});

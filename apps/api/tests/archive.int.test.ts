import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type { SqliteValue } from "../src/shared/ports/actor-storage.ts";

import { actorStorage } from "../src/platform/cloudflare/actor-storage.ts";
import { ArchiveRepository } from "../src/user-store/archive-repository.ts";
import { ArchiveService } from "../src/user-store/archive-service.ts";
import { memoryArchive } from "./archive-test-store.ts";
import { runInUserStore } from "./host.ts";

const NOW = "2026-11-06T12:00:00.000Z";
const seed = (storage: Parameters<Parameters<typeof runInUserStore>[1]>[1]["storage"]) => {
  storage.sql.exec(
    "INSERT INTO events (id,type,occurred_at,recorded_at,device_id,precision,source,payload) VALUES ('auto:archive:old','future.unknown','2026-01-02T12:00:00Z','2026-01-02T12:00:00Z','fixture','exact','app',?)",
    '{"opaque":"Я🦊"}',
  );
};

describe("copy-only durable archive publication", () => {
  it("stages immutable bytes before publication and verifies remote data and manifest before commit", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (user, state) => {
      seed(state.storage);
      const bucket = memoryArchive();
      const service = new ArchiveService({
        storage: user.ctx.storage,
        archive: bucket.store,
        owner: "owner",
        sourceSchemaTag: "test",
        canWrite: () => true,
      });
      const prepared = await service.captureArchiveMonth({
        month: "2026-01",
        now: NOW,
        timezone: "UTC",
      });
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) {
        throw new Error(prepared.error);
      }
      expect(bucket.objects.size).toBe(0);
      const committed = await service.resumeArchiveOperation(prepared.value.id, NOW);
      expect(committed).toMatchObject({ ok: true, value: { stage: "committed" } });
      expect(bucket.objects.size).toBe(2);
      expect(bucket.calls.map((call) => call.split(":", 1)[0])).toEqual([
        "put",
        "get",
        "put",
        "get",
        "get",
      ]);
      expect(await user.countEvents()).toBe(1);
      expect(
        await service.captureArchiveMonth({ month: "2026-01", now: NOW, timezone: "UTC" }),
      ).toEqual(committed);
    });
  });
});

describe("archive journal integrity", () => {
  it("does not publish corrupt staged bytes under an immutable valid content key", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (user, state) => {
      seed(state.storage);
      const bucket = memoryArchive();
      const service = new ArchiveService({
        storage: user.ctx.storage,
        archive: bucket.store,
        owner: "owner",
        sourceSchemaTag: "test",
        canWrite: () => true,
      });
      const prepared = await service.captureArchiveMonth({
        month: "2026-01",
        now: NOW,
        timezone: "UTC",
      });
      if (!prepared.ok) {
        throw new Error(prepared.error);
      }
      state.storage.sql.exec("UPDATE _history_archive_chunks SET data=zeroblob(length(data))");
      expect(await service.resumeArchiveOperation(prepared.value.id, NOW)).toMatchObject({
        ok: false,
        error: "archive/integrity",
      });
      expect(bucket.objects.size).toBe(0);
    });
  });
});

it("keeps archive and phone-derived internals private to SQL analytics", async () => {
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  await runInUserStore(stub, async (store) => {
    expect(await store.querySql("SELECT * FROM _history_archive_operations")).toMatchObject({
      ok: false,
      error: { code: "sql/forbidden" },
    });
    expect(await store.querySql("SELECT * FROM _history_phone_daily")).toMatchObject({
      ok: false,
      error: { code: "sql/forbidden" },
    });
  });
});

describe("archive restart boundaries", () => {
  it.each(["data-put", "manifest-put", "uploaded", "verified", "local-commit", "after-commit"])(
    "resumes exact staged bytes after %s",
    async (boundary) => {
      const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
      await runInUserStore(stub, async (user, state) => {
        seed(state.storage);
        const bucket = memoryArchive();
        const storage = actorStorage(state.storage);
        const options = {
          storage,
          archive: bucket.store,
          owner: "owner",
          sourceSchemaTag: "test",
          canWrite: () => true,
        };
        const prepared = await new ArchiveService(options).captureArchiveMonth({
          month: "2026-01",
          now: NOW,
          timezone: "UTC",
        });
        if (!prepared.ok) {
          throw new Error(prepared.error);
        }
        let didInterrupt = false;
        const fail = () => {
          didInterrupt = true;
          throw new Error("fixture interrupted");
        };
        const interruptedStorage = {
          ...storage,
          sql: {
            exec: <Row extends Record<string, SqliteValue>>(
              query: string,
              ...bindings: SqliteValue[]
            ) => {
              if (
                !didInterrupt &&
                boundary === "local-commit" &&
                query.startsWith("INSERT INTO _history_archive_manifests")
              ) {
                return fail();
              }
              const result = storage.sql.exec<Row>(query, ...bindings);
              return !didInterrupt &&
                ["uploaded", "verified"].includes(boundary) &&
                query.startsWith("UPDATE _history_archive_operations SET stage") &&
                bindings[0] === boundary
                ? fail()
                : result;
            },
          },
          transactionSync: <T>(body: () => T): T => {
            const result = storage.transactionSync(body);
            return !didInterrupt && boundary === "after-commit" ? fail() : result;
          },
        };
        const interruptedArchive = {
          ...bucket.store,
          putIfAbsent: async (key: string, bytes: Uint8Array) => {
            const result = await bucket.store.putIfAbsent(key, bytes);
            return !didInterrupt &&
              ((boundary === "data-put" && key.includes("/months/")) ||
                (boundary === "manifest-put" && key.includes("/manifests/")))
              ? fail()
              : result;
          },
        };
        const interrupted = new ArchiveService({
          ...options,
          storage: interruptedStorage,
          archive: interruptedArchive,
        });
        await expect(interrupted.resumeArchiveOperation(prepared.value.id, NOW)).rejects.toThrow(
          "fixture interrupted",
        );
        expect(
          (await new ArchiveService(options).resumeArchiveOperation(prepared.value.id, NOW)).ok,
        ).toBe(true);
        expect(bucket.objects.size).toBe(2);
        expect(new ArchiveRepository(storage).selected()).toEqual([prepared.value.id]);
        expect(await user.countEvents()).toBe(1);
        const putsBefore = bucket.calls.filter((call) => call.startsWith("put:")).length;
        await new ArchiveService(options).resumeArchiveOperation(prepared.value.id, NOW);
        expect(bucket.calls.filter((call) => call.startsWith("put:"))).toHaveLength(putsBefore);
      });
    },
  );

  it("keeps an older retry historical when a late backdate dirties the captured month", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (user, state) => {
      seed(state.storage);
      const bucket = memoryArchive();
      const options = {
        storage: user.ctx.storage,
        archive: bucket.store,
        owner: "owner",
        sourceSchemaTag: "test",
        canWrite: () => true,
      };
      const service = new ArchiveService(options);
      const old = await service.captureArchiveMonth({
        month: "2026-01",
        now: NOW,
        timezone: "UTC",
      });
      if (!old.ok) {
        throw new Error(old.error);
      }
      state.storage.sql.exec(
        "INSERT INTO events (id,type,occurred_at,recorded_at,device_id,precision,source,payload) VALUES ('auto:late','event.revoked','2026-01-01T00:00:00Z','2026-11-06T00:00:00Z','fixture','exact','app',?)",
        JSON.stringify({ targetId: "auto:archive:old" }),
      );
      expect((await service.resumeArchiveOperation(old.value.id, NOW)).ok).toBe(true);
      expect(new ArchiveRepository(user.ctx.storage).selected()).toHaveLength(0);
      const fresh = await service.captureArchiveMonth({
        month: "2026-01",
        now: NOW,
        timezone: "UTC",
      });
      if (!fresh.ok) {
        throw new Error(fresh.error);
      }
      expect(fresh.value.id).not.toBe(old.value.id);
      expect((await service.resumeArchiveOperation(fresh.value.id, NOW)).ok).toBe(true);
      expect(bucket.objects.size).toBe(4);
      expect(await user.countEvents()).toBe(2);
    });
  });

  it("rejects another generation or owner before any object write", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (user, state) => {
      seed(state.storage);
      const bucket = memoryArchive();
      const options = {
        storage: user.ctx.storage,
        archive: bucket.store,
        owner: "owner",
        sourceSchemaTag: "test",
        canWrite: () => true,
      };
      const service = new ArchiveService(options);
      const prepared = await service.captureArchiveMonth({
        month: "2026-01",
        now: NOW,
        timezone: "UTC",
      });
      if (!prepared.ok) {
        throw new Error(prepared.error);
      }
      expect(
        await new ArchiveService({ ...options, owner: "other" }).resumeArchiveOperation(
          prepared.value.id,
          NOW,
        ),
      ).toMatchObject({ ok: false, error: "archive/integrity" });
      await state.storage.put("storeId", "new-generation");
      expect(await service.resumeArchiveOperation(prepared.value.id, NOW)).toMatchObject({
        ok: false,
        error: "archive/stale",
      });
      expect(bucket.objects.size).toBe(0);
    });
  });
});

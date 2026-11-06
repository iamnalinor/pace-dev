import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { err, ok } from "@pace/core";

import type { AccountCleanup } from "./account-cleanup-types.ts";
import type { ArchiveStore } from "./ports/archive-store.ts";

import { archiveStore } from "../platform/cloudflare/archive-store.ts";
import { keyValue } from "../platform/cloudflare/key-value.ts";
import { d1 } from "../platform/cloudflare/sqlite.ts";
import { prepareAccountCleanup } from "./account-cleanup-repository.ts";
import {
  beginAccountCleanup,
  type CleanupEnvironment,
  resumeAccountCleanup,
} from "./account-cleanup.ts";
import { accountCleanupOperations, accountConfirmations, users } from "./db/d1-schema.ts";

const db = d1(env.DB);
const fixture = (options: { archiveRequired?: boolean; failResetOnce?: boolean } = {}) => {
  const userId = `owner/${crypto.randomUUID()}`;
  const prefix = `history/v1/${encodeURIComponent(userId)}/`;
  const objects = new Map([
    [`${prefix}old/months/a`, new Uint8Array([1])],
    [`${prefix}old/manifests/b`, new Uint8Array([2])],
    [`${prefix}new/uncommitted`, new Uint8Array([3])],
    [`${prefix.slice(0, -1)}-other/keep`, new Uint8Array([4])],
  ]);
  let source = "old";
  let resetCount = 0;
  let resetCalls = 0;
  let isFailedDelete = false;
  let isFailedList = false;
  let isStealingLease = false;
  const newRows: string[] = [];
  const archive: ArchiveStore = {
    putIfAbsent: async () => err("archive/unavailable"),
    get: async (key) => ok(objects.get(key) ?? null),
    list: async ({ prefix: requested }) => {
      if (isStealingLease) {
        await db
          .update(accountCleanupOperations)
          .set({ leaseToken: "another-worker", leaseUntil: new Date(Date.now() + 60_000) })
          .where(eq(accountCleanupOperations.userId, userId));
      }
      const keys = objects
        .keys()
        .filter((key) => key.startsWith(requested))
        .take(1)
        .toArray();
      return isFailedList
        ? err("archive/unavailable")
        : ok({ keys, ...(keys.length > 0 && { cursor: "ignore-shifting-page-cursor" }) });
    },
    delete: async (key) => {
      if (isFailedDelete) {
        return err("archive/unavailable");
      }
      objects.delete(key);
      return ok(undefined);
    },
  };
  const bindings: CleanupEnvironment = {
    DB: db,
    OAUTH_KV: keyValue(env.OAUTH_KV),
    HISTORY_ARCHIVE: archive,
    USER_STORE: {
      of: () => ({
        beginCleanup: async () =>
          ok({ sourceStoreId: "old", archiveRequired: options.archiveRequired ?? true }),
        resetForCleanup: async ({ operationId, expectedStoreId }) => {
          resetCalls++;
          if (source === expectedStoreId) {
            const journal = await db.query.accountCleanupOperations.findFirst({
              where: eq(accountCleanupOperations.id, operationId),
            });
            if (journal === undefined) {
              throw new Error("missing journal");
            }
            source = journal.nextStoreId;
            newRows.length = 0;
            resetCount++;
          }
          return resetCalls === 1 && options.failResetOnce === true
            ? err("cleanup/unavailable")
            : ok({ storeId: source });
        },
        finishCleanup: async () => ok(undefined),
        endLiveSessions: async () => undefined,
      }),
    },
  };
  return {
    bindings,
    userId,
    prefix,
    objects,
    resetCount: () => resetCount,
    current: () => source,
    newRows,
    appendNewData: () => {
      newRows.push("new-generation-event");
    },
    setCurrent: (value: string) => {
      source = value;
    },
    stealLeaseOnList: () => {
      isStealingLease = true;
    },
    failDelete: () => {
      isFailedDelete = true;
    },
    failList: () => {
      isFailedList = true;
    },
    recover: () => {
      isFailedDelete = false;
      isFailedList = false;
    },
  };
};
const due = async (id: string) => {
  await db
    .update(accountCleanupOperations)
    .set({ leaseUntil: null, nextAttemptAt: new Date(0) })
    .where(eq(accountCleanupOperations.id, id));
};

const applyCompletedEffects = async (
  data: ReturnType<typeof fixture>,
  phase: number,
  nextStoreId: string,
): Promise<void> => {
  if (phase >= 2) {
    await data.bindings.OAUTH_KV.delete(`grant:${data.userId}:orphan`);
  }
  if (phase >= 3) {
    for (const key of data.objects.keys()) {
      if (key.startsWith(data.prefix)) {
        data.objects.delete(key);
      }
    }
  }
  if (phase >= 4) {
    data.setCurrent(nextStoreId);
    data.appendNewData();
  }
  if (phase >= 5) {
    await db.delete(users).where(eq(users.id, data.userId));
  }
};

describe("account archive cleanup coordinator", () => {
  it("deletes all generations and uncommitted objects by owner, listing from the start after deletion", async () => {
    const data = fixture();
    const operationId = crypto.randomUUID();
    expect(
      await beginAccountCleanup(data.bindings, {
        operationId,
        userId: data.userId,
        action: "wipe",
      }),
    ).toEqual({ ok: true, value: { operationId, status: "complete" } });
    expect(data.objects.keys().toArray()).toEqual([`${data.prefix.slice(0, -1)}-other/keep`]);
    expect(data.resetCount()).toBe(1);
  });

  it.each(["failDelete", "failList"] as const)(
    "retains pending retry evidence after %s failure",
    async (failure) => {
      const data = fixture();
      data[failure]();
      const operationId = crypto.randomUUID();
      expect(
        await beginAccountCleanup(data.bindings, {
          operationId,
          userId: data.userId,
          action: "wipe",
        }),
      ).toEqual({ ok: false, error: "cleanup/archive-unavailable" });
      expect(data.resetCount()).toBe(0);
      data.recover();
      await due(operationId);
      expect(await resumeAccountCleanup(data.bindings, operationId)).toEqual({
        ok: true,
        value: { operationId, status: "complete" },
      });
      expect(data.resetCount()).toBe(1);
    },
  );

  it("does not wipe a newer generation after a crash immediately following reset", async () => {
    const data = fixture({ failResetOnce: true });
    const operationId = crypto.randomUUID();
    expect(
      (
        await beginAccountCleanup(data.bindings, {
          operationId,
          userId: data.userId,
          action: "wipe",
        })
      ).ok,
    ).toBe(false);
    expect(data.current()).not.toBe("old");
    data.appendNewData();
    await due(operationId);
    expect((await resumeAccountCleanup(data.bindings, operationId)).ok).toBe(true);
    expect(data.resetCount()).toBe(1);
    expect(data.newRows).toEqual(["new-generation-event"]);
    expect((await resumeAccountCleanup(data.bindings, operationId)).ok).toBe(true);
    expect(data.resetCount()).toBe(1);
  });

  it("stops before deleting a returned page when another worker replaced its lease", async () => {
    const data = fixture();
    data.stealLeaseOnList();
    const operationId = crypto.randomUUID();
    expect(
      await beginAccountCleanup(data.bindings, {
        operationId,
        userId: data.userId,
        action: "wipe",
      }),
    ).toEqual({ ok: false, error: "cleanup/busy" });
    expect(data.objects.size).toBe(4);
    expect(data.resetCount()).toBe(0);
  });

  it("cleans real R2 pages without touching an adjacent owner", async () => {
    const data = fixture();
    const archive = archiveStore(env.TEST_HISTORY_ARCHIVE);
    for (const [key, bytes] of data.objects) {
      await archive.putIfAbsent(key, bytes);
    }
    const result = await beginAccountCleanup(
      { ...data.bindings, HISTORY_ARCHIVE: archive },
      { operationId: crypto.randomUUID(), userId: data.userId, action: "wipe" },
    );
    expect(result.ok).toBe(true);
    expect(await archive.list({ prefix: data.prefix, limit: 10 })).toEqual({
      ok: true,
      value: { keys: [] },
    });
    expect(await archive.get(`${data.prefix.slice(0, -1)}-other/keep`)).toEqual({
      ok: true,
      value: new Uint8Array([4]),
    });
  });

  it.each([
    "prepared",
    "fenced",
    "grants-cleared",
    "archives-cleared",
    "reset",
    "identity-cleared",
    "sockets-closed",
  ] as const)(
    "reconstructs a coordinator from durable %s and completes all remaining effects",
    async (stage) => {
      const data = fixture();
      const operationId = crypto.randomUUID();
      const prepared = await prepareAccountCleanup(db, {
        operationId,
        userId: data.userId,
        action: "delete",
        now: new Date(),
      });
      if (!prepared.ok) {
        throw new Error(prepared.error);
      }
      const stages: readonly AccountCleanup["stage"][] = [
        "prepared",
        "fenced",
        "grants-cleared",
        "archives-cleared",
        "reset",
        "identity-cleared",
        "sockets-closed",
      ];
      const phase = stages.indexOf(stage);
      await db.insert(users).values({
        id: data.userId,
        telegramId: crypto.randomUUID(),
        name: "Cleanup",
        createdAt: new Date(),
      });
      await db.insert(accountConfirmations).values({
        id: operationId,
        userId: data.userId,
        telegramId: "1001",
        action: "delete",
        status: "processing",
        createdAt: new Date(),
        expiresAt: new Date(0),
        sessionId: "expired-session",
      });
      await data.bindings.OAUTH_KV.put(`grant:${data.userId}:orphan`, "opaque-old-grant");
      await applyCompletedEffects(data, phase, prepared.value.nextStoreId);
      await db
        .update(accountCleanupOperations)
        .set({
          stage,
          sourceStoreId: stage === "prepared" ? null : "old",
          archiveRequired: stage === "prepared" ? null : true,
        })
        .where(eq(accountCleanupOperations.id, operationId));
      expect(await resumeAccountCleanup(data.bindings, operationId)).toEqual({
        ok: true,
        value: { operationId, status: "complete" },
      });
      expect(await db.query.users.findFirst({ where: eq(users.id, data.userId) })).toBeUndefined();
      expect(await data.bindings.OAUTH_KV.get(`grant:${data.userId}:orphan`)).toBeNull();
      expect(
        (
          await db.query.accountConfirmations.findFirst({
            where: eq(accountConfirmations.id, operationId),
          })
        )?.status,
      ).toBe("confirmed");
      expect(data.objects.keys().toArray()).toEqual([`${data.prefix.slice(0, -1)}-other/keep`]);
      expect(data.resetCount()).toBe(phase >= 4 ? 0 : 1);
      expect(data.newRows).toEqual(phase >= 4 ? ["new-generation-event"] : []);
    },
  );

  it("never certifies an empty page with an unresolved continuation cursor", async () => {
    const data = fixture();
    const original = data.bindings.HISTORY_ARCHIVE;
    if (original === undefined) {
      throw new Error("fixture archive missing");
    }
    const archive: ArchiveStore = {
      ...original,
      list: async () => ok({ keys: [], cursor: "more-objects" }),
    };
    expect(
      await beginAccountCleanup(
        { ...data.bindings, HISTORY_ARCHIVE: archive },
        { operationId: crypto.randomUUID(), userId: data.userId, action: "wipe" },
      ),
    ).toEqual({ ok: false, error: "cleanup/archive-unavailable" });
    expect(data.resetCount()).toBe(0);
  });

  it("yields a large prefix durably and resumes before allowing reset", async () => {
    const data = fixture();
    for (let index = 0; index < 101; index++) {
      data.objects.set(`${data.prefix}generation/extra-${index}`, new Uint8Array([0]));
    }
    const operationId = crypto.randomUUID();
    expect(
      await beginAccountCleanup(data.bindings, {
        operationId,
        userId: data.userId,
        action: "wipe",
      }),
    ).toEqual({ ok: true, value: { operationId, status: "pending" } });
    expect(data.resetCount()).toBe(0);
    expect(await resumeAccountCleanup(data.bindings, operationId)).toEqual({
      ok: true,
      value: { operationId, status: "complete" },
    });
    expect(data.resetCount()).toBe(1);
  });

  it("allows never-configured archives but blocks missing storage with archive evidence", async () => {
    const data = fixture({ archiveRequired: false });
    const { HISTORY_ARCHIVE: _unused, ...withoutArchive } = data.bindings;
    expect(
      (
        await beginAccountCleanup(withoutArchive, {
          operationId: crypto.randomUUID(),
          userId: data.userId,
          action: "wipe",
        })
      ).ok,
    ).toBe(true);
    const required = fixture();
    const { HISTORY_ARCHIVE: _required, ...missing } = required.bindings;
    expect(
      await beginAccountCleanup(missing, {
        operationId: crypto.randomUUID(),
        userId: required.userId,
        action: "wipe",
      }),
    ).toEqual({ ok: false, error: "cleanup/archive-unavailable" });
    expect(required.resetCount()).toBe(0);
  });
});

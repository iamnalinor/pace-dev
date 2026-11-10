import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { d1 } from "../platform/cloudflare/sqlite.ts";
import {
  claimAccountCleanup,
  findAccountCleanup,
  getPendingAccountCleanup,
  prepareAccountCleanup,
} from "./account-cleanup-repository.ts";
import { accountCleanupOperations, users } from "./db/d1-schema.ts";

const db = d1(env.DB);
const prepare = async (userId: string = crypto.randomUUID(), id: string = crypto.randomUUID()) => {
  const result = await prepareAccountCleanup(db, {
    operationId: id,
    userId,
    action: "wipe",
    now: new Date(),
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

describe("durable account cleanup journal", () => {
  it("reuses only the same operation identity and preserves its next generation", async () => {
    const first = await prepare();
    const repeated = await prepare(first.userId, first.id);
    const concurrent = await prepareAccountCleanup(db, {
      operationId: crypto.randomUUID(),
      userId: first.userId,
      action: "wipe",
      now: new Date(),
    });
    expect(repeated.id).toBe(first.id);
    expect(concurrent).toEqual({ ok: false, error: "cleanup/busy" });
    expect(repeated.nextStoreId).toBe(first.nextStoreId);
    expect(await getPendingAccountCleanup(db, first.userId)).toEqual({ ok: true, value: first });
  });

  it("does not cascade its retry evidence when the D1 user is deleted", async () => {
    const userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      telegramId: crypto.randomUUID(),
      name: "Cleanup",
      createdAt: new Date(),
    });
    const operation = await prepare(userId);
    await db.delete(users).where(eq(users.id, userId));
    expect(await findAccountCleanup(db, operation.id)).toEqual({ ok: true, value: operation });
  });

  it("leases one worker at a time and permits recovery after expiry", async () => {
    const operation = await prepare();
    const now = new Date();
    const first = await claimAccountCleanup(db, operation.id, now);
    expect(first.ok).toBe(true);
    expect(await claimAccountCleanup(db, operation.id, now)).toEqual({
      ok: false,
      error: "cleanup/busy",
    });
    await db
      .update(accountCleanupOperations)
      .set({ leaseUntil: new Date(now.getTime() - 1) })
      .where(eq(accountCleanupOperations.id, operation.id));
    const resumed = await claimAccountCleanup(db, operation.id, now);
    expect(resumed.ok).toBe(true);
    if (!first.ok || !resumed.ok) {
      throw new Error("lease claim failed");
    }
    expect(resumed.value.leaseToken).not.toBe(first.value.leaseToken);
  });
});

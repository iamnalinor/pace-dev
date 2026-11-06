import { and, eq, exists, isNull, lte, ne, or, sql } from "drizzle-orm";

import { err, ok, type Result } from "@pace/core";

import type {
  AccountCleanup,
  CleanupError,
  CleanupInput,
  LeasedAccountCleanup,
} from "./account-cleanup-types.ts";
import type { Db } from "./db/d1.ts";

import { randomBase64Url } from "./crypto.ts";
import { accountCleanupOperations, accountConfirmations } from "./db/d1-schema.ts";

export const CLEANUP_LEASE_MS = 60_000;

const journalAttempt = async <T>(
  operation: () => Promise<Result<T, CleanupError>>,
): Promise<Result<T, CleanupError>> => {
  try {
    return await operation();
  } catch {
    return err("cleanup/unavailable");
  }
};

export const findAccountCleanup = async (
  db: Db,
  id: string,
): Promise<Result<AccountCleanup | undefined, CleanupError>> =>
  await journalAttempt(async () =>
    ok(
      await db.query.accountCleanupOperations.findFirst({
        where: eq(accountCleanupOperations.id, id),
      }),
    ),
  );

export const getPendingAccountCleanup = async (
  db: Db,
  userId: string,
): Promise<Result<AccountCleanup | undefined, CleanupError>> =>
  await journalAttempt(async () => {
    const where = and(
      eq(accountCleanupOperations.userId, userId),
      ne(accountCleanupOperations.stage, "complete"),
    );
    return ok(await db.query.accountCleanupOperations.findFirst({ where }));
  });

const compatible = (
  row: AccountCleanup,
  input: CleanupInput,
): Result<AccountCleanup, CleanupError> =>
  row.userId === input.userId && row.action === input.action ? ok(row) : err("cleanup/invalid");

const insertOperation = async (
  db: Db,
  input: CleanupInput,
): Promise<Result<AccountCleanup, CleanupError>> => {
  const [row] = await db
    .insert(accountCleanupOperations)
    .values({
      id: input.operationId,
      userId: input.userId,
      action: input.action,
      nextStoreId: randomBase64Url(16),
      stage: "prepared",
      createdAt: input.now,
      updatedAt: input.now,
      nextAttemptAt: input.now,
    })
    .onConflictDoNothing()
    .returning();
  if (row !== undefined) {
    return ok(row);
  }
  const pending = await getPendingAccountCleanup(db, input.userId);
  if (!pending.ok) {
    return pending;
  }
  return pending.value?.id === input.operationId
    ? compatible(pending.value, input)
    : err("cleanup/busy");
};

export const prepareAccountCleanup = async (
  db: Db,
  input: CleanupInput,
): Promise<Result<AccountCleanup, CleanupError>> =>
  await journalAttempt(async () => {
    if (input.operationId === "" || input.userId === "" || !input.userId.isWellFormed()) {
      return err("cleanup/invalid");
    }
    const existing = await findAccountCleanup(db, input.operationId);
    if (!existing.ok) {
      return existing;
    }
    return existing.value === undefined
      ? await insertOperation(db, input)
      : compatible(existing.value, input);
  });

export const claimAccountCleanup = async (
  db: Db,
  id: string,
  now: Date,
): Promise<Result<LeasedAccountCleanup, CleanupError>> =>
  await journalAttempt(async () => {
    const leaseToken = crypto.randomUUID();
    const leaseUntil = new Date(now.getTime() + CLEANUP_LEASE_MS);
    const available = or(
      isNull(accountCleanupOperations.leaseUntil),
      lte(accountCleanupOperations.leaseUntil, now),
    );
    const [row] = await db
      .update(accountCleanupOperations)
      .set({
        leaseToken,
        leaseUntil,
        updatedAt: now,
        attempts: sql`${accountCleanupOperations.attempts} + 1`,
      })
      .where(
        and(
          eq(accountCleanupOperations.id, id),
          ne(accountCleanupOperations.stage, "complete"),
          lte(accountCleanupOperations.nextAttemptAt, now),
          available,
        ),
      )
      .returning();
    return row === undefined ? err("cleanup/busy") : ok({ ...row, leaseToken, leaseUntil });
  });

export type CleanupPatch = Partial<
  Pick<AccountCleanup, "archiveRequired" | "sourceStoreId" | "stage">
>;

export const updateAccountCleanup = async (
  db: Db,
  lease: LeasedAccountCleanup,
  patch: CleanupPatch,
): Promise<Result<LeasedAccountCleanup, CleanupError>> =>
  await journalAttempt(async () => {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + CLEANUP_LEASE_MS);
    const [row] = await db
      .update(accountCleanupOperations)
      .set({ ...patch, updatedAt: now, leaseUntil })
      .where(
        and(
          eq(accountCleanupOperations.id, lease.id),
          eq(accountCleanupOperations.leaseToken, lease.leaseToken),
          eq(accountCleanupOperations.stage, lease.stage),
          sql`${accountCleanupOperations.leaseUntil} > ${now.getTime()}`,
        ),
      )
      .returning();
    return row === undefined
      ? err("cleanup/busy")
      : ok({ ...row, leaseToken: lease.leaseToken, leaseUntil });
  });

export const releaseAccountCleanup = async (
  db: Db,
  lease: LeasedAccountCleanup,
  error?: CleanupError,
): Promise<Result<void, CleanupError>> =>
  await journalAttempt(async () => {
    const now = new Date();
    const delay =
      error === undefined ? 0 : Math.min(300_000, 1000 * 2 ** Math.min(lease.attempts, 8));
    await db
      .update(accountCleanupOperations)
      .set({
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: new Date(now.getTime() + delay),
        lastError: error ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(accountCleanupOperations.id, lease.id),
          eq(accountCleanupOperations.leaseToken, lease.leaseToken),
        ),
      );
    return ok(undefined);
  });

export const dueAccountCleanups = async (
  db: Db,
  now: Date,
): Promise<Result<readonly AccountCleanup[], CleanupError>> =>
  await journalAttempt(async () => {
    const available = or(
      isNull(accountCleanupOperations.leaseUntil),
      lte(accountCleanupOperations.leaseUntil, now),
    );
    const where = and(
      ne(accountCleanupOperations.stage, "complete"),
      lte(accountCleanupOperations.nextAttemptAt, now),
      available,
    );
    const rows = await db.select().from(accountCleanupOperations).where(where).limit(25);
    return ok(rows);
  });

export const completeAccountCleanup = async (
  db: Db,
  lease: LeasedAccountCleanup,
): Promise<Result<void, CleanupError>> =>
  await journalAttempt(async () => {
    const now = new Date();
    const completed = db
      .update(accountCleanupOperations)
      .set({
        stage: "complete",
        leaseToken: null,
        leaseUntil: null,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(accountCleanupOperations.id, lease.id),
          eq(accountCleanupOperations.leaseToken, lease.leaseToken),
          eq(accountCleanupOperations.stage, "sockets-closed"),
          sql`${accountCleanupOperations.leaseUntil} > ${now.getTime()}`,
        ),
      )
      .returning({ id: accountCleanupOperations.id });
    const completedIdentity = and(
      eq(accountCleanupOperations.id, lease.id),
      eq(accountCleanupOperations.stage, "complete"),
    );
    const completedOperation = db
      .select({ id: accountCleanupOperations.id })
      .from(accountCleanupOperations)
      .where(completedIdentity);
    const terminalIdentity = and(
      eq(accountConfirmations.id, lease.id),
      eq(accountConfirmations.status, "processing"),
      exists(completedOperation),
    );
    const terminal = db
      .update(accountConfirmations)
      .set({ status: "confirmed" })
      .where(terminalIdentity);
    const [rows] = await db.batch([completed, terminal]);
    return rows.length === 0 ? err("cleanup/busy") : ok(undefined);
  });

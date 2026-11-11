import { and, eq, notExists } from "drizzle-orm";

import { err, ok, type Result } from "@pace/core";

import type { CleanupEnvironment } from "./account-cleanup-environment.ts";
import type { CleanupError, CleanupOutcome } from "./account-cleanup-types.ts";

import { dueAccountCleanups } from "./account-cleanup-repository.ts";
import { beginAccountCleanup, resumeAccountCleanup } from "./account-cleanup.ts";
import { accountCleanupOperations, accountConfirmations } from "./db/d1-schema.ts";

type Confirmation = typeof accountConfirmations.$inferSelect;

/** Processing is durable authorization. Retrying never reclaims a cancelled or pending request. */
export const reconcileAccountConfirmation = async (
  env: CleanupEnvironment,
  row: Confirmation,
): Promise<Result<CleanupOutcome, CleanupError>> => {
  const current = await env.DB.query.accountConfirmations.findFirst({
    where: eq(accountConfirmations.id, row.id),
  });
  if (current?.status !== "processing") {
    return err("cleanup/invalid");
  }
  const result = await beginAccountCleanup(env, {
    operationId: current.id,
    userId: current.userId,
    action: current.action,
  });
  if (!result.ok && result.error === "cleanup/busy") {
    const operation = env.DB.select({ id: accountCleanupOperations.id })
      .from(accountCleanupOperations)
      .where(eq(accountCleanupOperations.id, row.id));
    const retryCondition = and(
      eq(accountConfirmations.id, row.id),
      eq(accountConfirmations.status, "processing"),
      notExists(operation),
    );
    await env.DB.update(accountConfirmations).set({ status: "pending" }).where(retryCondition);
  }
  if (result.ok && result.value.operationId !== current.id) {
    return err("cleanup/invalid");
  }
  if (result.ok && result.value.status === "complete") {
    await env.DB.update(accountConfirmations)
      .set({ status: "confirmed" })
      .where(
        and(eq(accountConfirmations.id, row.id), eq(accountConfirmations.status, "processing")),
      );
  }
  return result;
};

type Sweep = { readonly completed: number; readonly pending: number; readonly failed: number };
const count = (results: readonly Result<CleanupOutcome, CleanupError>[]): Sweep => ({
  completed: results.filter((result) => result.ok && result.value.status === "complete").length,
  pending: results.filter((result) =>
    result.ok ? result.value.status === "pending" : result.error === "cleanup/busy",
  ).length,
  failed: results.filter((result) => !result.ok && result.error !== "cleanup/busy").length,
});

/** Host maintenance entry; deployment must explicitly configure its own schedule. */
export const sweepAccountCleanups = async (
  env: CleanupEnvironment,
): Promise<Result<Sweep, CleanupError>> => {
  const due = await dueAccountCleanups(env.DB, new Date());
  if (!due.ok) {
    return due;
  }
  const results: Result<CleanupOutcome, CleanupError>[] = [];
  for (const row of due.value) {
    results.push(await resumeAccountCleanup(env, row.id));
  }
  const processing = await env.DB.select()
    .from(accountConfirmations)
    .where(eq(accountConfirmations.status, "processing"))
    .limit(25);
  for (const row of processing) {
    results.push(await reconcileAccountConfirmation(env, row));
  }
  return ok(count(results));
};

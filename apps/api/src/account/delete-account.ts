import type { Context } from "hono";

import { err, type Result } from "@pace/core";

import type { CleanupError, CleanupOutcome } from "../shared/account-cleanup-types.ts";
import type { AppEnv } from "../shared/app-env.ts";

import { getPendingAccountCleanup } from "../shared/account-cleanup-repository.ts";
import { beginAccountCleanup, resumeAccountCleanup } from "../shared/account-cleanup.ts";

/** Direct test resets and signed Telegram confirmations share the durable coordinator. */
export const deleteAccount = async (
  c: Context<AppEnv>,
  userId: string,
): Promise<Result<CleanupOutcome, CleanupError>> => {
  const pending = await getPendingAccountCleanup(c.env.DB, userId);
  if (!pending.ok) {
    return pending;
  }
  if (pending.value !== undefined) {
    return pending.value.action === "delete"
      ? await resumeAccountCleanup(c.env, pending.value.id)
      : err("cleanup/busy");
  }
  return await beginAccountCleanup(c.env, {
    operationId: crypto.randomUUID(),
    userId,
    action: "delete",
  });
};

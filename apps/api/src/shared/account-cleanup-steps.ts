import { eq } from "drizzle-orm";

import { err, ok, type Result } from "@pace/core";

import type { CleanupEnvironment } from "./account-cleanup-environment.ts";
import type { CleanupPatch } from "./account-cleanup-repository.ts";
import type { CleanupError, LeasedAccountCleanup } from "./account-cleanup-types.ts";

import { removeAccountArchives } from "./account-cleanup-archives.ts";
import { users } from "./db/d1-schema.ts";
import { revokeAllGrants } from "./oauth-grants.ts";

type Step = { readonly patch: CleanupPatch; readonly isWaiting?: true };

const fence = async (
  env: CleanupEnvironment,
  lease: LeasedAccountCleanup,
): Promise<Result<Step, CleanupError>> => {
  const result = await env.USER_STORE.of(lease.userId).beginCleanup(lease.id);
  return result.ok ? ok({ patch: { ...result.value, stage: "fenced" } }) : result;
};
const reset = async (
  env: CleanupEnvironment,
  lease: LeasedAccountCleanup,
): Promise<Result<Step, CleanupError>> => {
  if (lease.sourceStoreId === null) {
    return err("cleanup/invalid");
  }
  const result = await env.USER_STORE.of(lease.userId).resetForCleanup({
    operationId: lease.id,
    expectedStoreId: lease.sourceStoreId,
  });
  if (!result.ok) {
    return result;
  }
  return result.value.storeId === lease.nextStoreId
    ? ok({ patch: { stage: "reset" } })
    : err("cleanup/invalid");
};

const clearGrants = async (
  env: CleanupEnvironment,
  lease: LeasedAccountCleanup,
): Promise<Result<Step, CleanupError>> => {
  if (lease.action === "delete") {
    await revokeAllGrants(env.OAUTH_KV, lease.userId);
  }
  return ok({ patch: { stage: "grants-cleared" } });
};
const clearArchives = async (
  env: CleanupEnvironment,
  lease: LeasedAccountCleanup,
): Promise<Result<Step, CleanupError>> => {
  const result = await removeAccountArchives(env, lease);
  if (!result.ok) {
    return result;
  }
  return ok(
    result.value ? { patch: { stage: "archives-cleared" } } : { patch: {}, isWaiting: true },
  );
};
const clearIdentity = async (
  env: CleanupEnvironment,
  lease: LeasedAccountCleanup,
): Promise<Result<Step, CleanupError>> => {
  if (lease.action === "delete") {
    await env.DB.delete(users).where(eq(users.id, lease.userId));
  }
  return ok({ patch: { stage: "identity-cleared" } });
};
const closeSockets = async (
  env: CleanupEnvironment,
  lease: LeasedAccountCleanup,
): Promise<Result<Step, CleanupError>> => {
  if (lease.action === "delete") {
    await env.USER_STORE.of(lease.userId).endLiveSessions();
  }
  return ok({ patch: { stage: "sockets-closed" } });
};

export const performAccountCleanupStep = async (
  env: CleanupEnvironment,
  lease: LeasedAccountCleanup,
): Promise<Result<Step, CleanupError>> => {
  switch (lease.stage) {
    case "prepared": {
      return await fence(env, lease);
    }
    case "fenced": {
      return await clearGrants(env, lease);
    }
    case "grants-cleared": {
      return await clearArchives(env, lease);
    }
    case "archives-cleared": {
      return await reset(env, lease);
    }
    case "reset": {
      return await clearIdentity(env, lease);
    }
    case "identity-cleared": {
      return await closeSockets(env, lease);
    }
    case "sockets-closed":
    case "complete": {
      return err("cleanup/invalid");
    }
  }
};

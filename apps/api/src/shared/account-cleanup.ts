import { err, ok, type Result } from "@pace/core";

import type { CleanupEnvironment } from "./account-cleanup-environment.ts";
import type {
  CleanupError,
  CleanupOutcome,
  LeasedAccountCleanup,
} from "./account-cleanup-types.ts";

import { removeAccountArchives } from "./account-cleanup-archives.ts";
import {
  claimAccountCleanup,
  completeAccountCleanup,
  findAccountCleanup,
  prepareAccountCleanup,
  releaseAccountCleanup,
  updateAccountCleanup,
} from "./account-cleanup-repository.ts";
import { performAccountCleanupStep } from "./account-cleanup-steps.ts";

export type { CleanupEnvironment } from "./account-cleanup-environment.ts";

const finish = async (
  env: CleanupEnvironment,
  operation: { readonly id: string; readonly userId: string },
): Promise<Result<CleanupOutcome, CleanupError>> => {
  const result = await env.USER_STORE.of(operation.userId).finishCleanup(operation.id);
  return result.ok ? ok({ operationId: operation.id, status: "complete" }) : result;
};

const finalize = async (
  env: CleanupEnvironment,
  lease: LeasedAccountCleanup,
): Promise<Result<CleanupOutcome, CleanupError>> => {
  const empty = await removeAccountArchives(env, lease);
  if (!empty.ok) {
    return empty;
  }
  if (!empty.value) {
    return ok({ operationId: lease.id, status: "pending" });
  }
  const completed = await completeAccountCleanup(env.DB, lease);
  return completed.ok ? await finish(env, lease) : completed;
};

const run = async (
  env: CleanupEnvironment,
  initial: LeasedAccountCleanup,
): Promise<Result<CleanupOutcome, CleanupError>> => {
  let lease = initial;
  while (lease.stage !== "sockets-closed") {
    const authority = await updateAccountCleanup(env.DB, lease, {});
    if (!authority.ok) {
      return authority;
    }
    const step = await performAccountCleanupStep(env, authority.value);
    if (!step.ok) {
      return step;
    }
    const saved = await updateAccountCleanup(env.DB, authority.value, step.value.patch);
    if (!saved.ok) {
      return saved;
    }
    lease = saved.value;
    if (step.value.isWaiting === true) {
      return ok({ operationId: lease.id, status: "pending" });
    }
  }
  return await finalize(env, lease);
};

const execute = async (
  env: CleanupEnvironment,
  lease: LeasedAccountCleanup,
): Promise<Result<CleanupOutcome, CleanupError>> => {
  try {
    const result = await run(env, lease);
    const released = await releaseAccountCleanup(
      env.DB,
      lease,
      result.ok ? undefined : result.error,
    );
    return released.ok ? result : released;
  } catch {
    await releaseAccountCleanup(env.DB, lease, "cleanup/unavailable");
    return err("cleanup/unavailable");
  }
};

export const resumeAccountCleanup = async (
  env: CleanupEnvironment,
  operationId: string,
): Promise<Result<CleanupOutcome, CleanupError>> => {
  const existing = await findAccountCleanup(env.DB, operationId);
  if (!existing.ok) {
    return existing;
  }
  if (existing.value === undefined) {
    return err("cleanup/invalid");
  }
  if (existing.value.stage === "complete") {
    return await finish(env, existing.value);
  }
  const lease = await claimAccountCleanup(env.DB, operationId, new Date());
  return lease.ok ? await execute(env, lease.value) : lease;
};

export const beginAccountCleanup = async (
  env: CleanupEnvironment,
  input: {
    readonly operationId: string;
    readonly userId: string;
    readonly action: "delete" | "wipe";
  },
): Promise<Result<CleanupOutcome, CleanupError>> => {
  const prepared = await prepareAccountCleanup(env.DB, { ...input, now: new Date() });
  return prepared.ok ? await resumeAccountCleanup(env, prepared.value.id) : prepared;
};

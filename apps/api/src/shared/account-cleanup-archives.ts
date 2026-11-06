import { err, ok, type Result } from "@pace/core";

import type { CleanupEnvironment } from "./account-cleanup-environment.ts";
import type { CleanupError, LeasedAccountCleanup } from "./account-cleanup-types.ts";
import type { ArchiveStore } from "./ports/archive-store.ts";

import { updateAccountCleanup } from "./account-cleanup-repository.ts";

const ownerPrefix = (owner: string): string =>
  `history/v1/${encodeURIComponent(owner).replaceAll(".", "%2E")}/`;

const nextKey = async (
  env: CleanupEnvironment,
  archive: ArchiveStore,
  lease: LeasedAccountCleanup,
): Promise<Result<null | string, CleanupError>> => {
  const prefix = ownerPrefix(lease.userId);
  const page = await archive.list({ prefix, limit: 1 });
  if (!page.ok) {
    return err("cleanup/archive-unavailable");
  }
  const authority = await updateAccountCleanup(env.DB, lease, {});
  if (!authority.ok) {
    return authority;
  }
  const key = page.value.keys[0];
  if (key === undefined) {
    return page.value.cursor === undefined ? ok(null) : err("cleanup/archive-unavailable");
  }
  return key.startsWith(prefix) ? ok(key) : err("cleanup/invalid");
};

/** Restart listing after each deletion; provider cursors can shift as keys disappear. */
export const removeAccountArchives = async (
  env: CleanupEnvironment,
  lease: LeasedAccountCleanup,
): Promise<Result<boolean, CleanupError>> => {
  const archive = env.HISTORY_ARCHIVE;
  if (archive === undefined) {
    return lease.archiveRequired === true ? err("cleanup/archive-unavailable") : ok(true);
  }
  for (let deleted = 0; deleted < 100; deleted++) {
    const next = await nextKey(env, archive, lease);
    if (!next.ok) {
      return next;
    }
    if (next.value === null) {
      return ok(true);
    }
    const removed = await archive.delete(next.value);
    if (!removed.ok) {
      return err("cleanup/archive-unavailable");
    }
  }
  return ok(false);
};

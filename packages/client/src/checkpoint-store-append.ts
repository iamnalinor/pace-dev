import { err, type Event, ok, type Result } from "@pace/core";

import type {
  CopyGuard,
  CopyMeta,
  LocalRecord,
  LocalSnapshot,
  RebuildError,
} from "./checkpoint-store-types.ts";

import { canReplaySnapshot } from "./checkpoint-store-common.ts";
import { idSet } from "./checkpoint-validation.ts";
import { COPY_CHANGED, REBUILD_REQUIRED } from "./sync-error.ts";

/** An unconfirmed copy (no store id in the guard yet) may have acquired its first generation. */
export const canAppendToCopy = (
  current: Pick<CopyMeta, "copyToken" | "owner" | "storeId">,
  guard: CopyGuard,
): boolean =>
  current.copyToken === guard.copyToken &&
  current.owner === guard.owner &&
  (guard.storeId === null || current.storeId === guard.storeId);
/** Rebase ordinary local writes inside the transaction; an unconfirmed same copy may acquire its first generation. */
export const appendLocalSnapshot = (
  current: LocalSnapshot,
  input: { readonly events: readonly Event[]; readonly guard: CopyGuard },
): Result<LocalSnapshot, RebuildError> => {
  if (!canAppendToCopy(current, input.guard)) {
    return err(COPY_CHANGED);
  }
  const records = new Map<string, LocalRecord>(
    current.records.map((record) => [record.event.id, record]),
  );
  const pending = new Set(current.pendingIds);
  for (const event of input.events) {
    if (records.has(event.id)) {
      continue;
    }
    if (current.checkpoint !== null && idSet(current.checkpoint.value.eventIds).has(event.id)) {
      return err(REBUILD_REQUIRED);
    }
    records.set(event.id, { event, seq: null });
    pending.add(event.id);
  }
  const next: LocalSnapshot = {
    ...current,
    records: records.values().toArray(),
    pendingIds: [...pending],
  };
  return canReplaySnapshot(next) ? ok(next) : err(REBUILD_REQUIRED);
};

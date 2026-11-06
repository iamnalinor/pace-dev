import { err, type Event, ok, type Result } from "@pace/core";

import type {
  CopyGuard,
  LocalRecord,
  LocalSnapshot,
  RebuildError,
} from "./checkpoint-store-types.ts";

import { canReplaySnapshot } from "./checkpoint-store-common.ts";

const canAppendToCopy = (current: LocalSnapshot, guard: CopyGuard): boolean =>
  current.copyToken === guard.copyToken &&
  current.owner === guard.owner &&
  (guard.storeId === null || current.storeId === guard.storeId);
/** Rebase ordinary local writes inside the transaction; an unconfirmed same copy may acquire its first generation. */
export const appendLocalSnapshot = (
  current: LocalSnapshot,
  input: { readonly events: readonly Event[]; readonly guard?: CopyGuard },
): Result<LocalSnapshot, RebuildError> => {
  if (input.guard !== undefined && !canAppendToCopy(current, input.guard)) {
    return err("sync/copy-changed");
  }
  const records = new Map<string, LocalRecord>(
    current.records.map((record) => [record.event.id, record]),
  );
  const pending = new Set(current.pendingIds);
  for (const event of input.events) {
    if (records.has(event.id)) {
      continue;
    }
    if (current.checkpoint?.value.eventIds.includes(event.id) === true) {
      return err("history/rebuild-required");
    }
    records.set(event.id, { event, seq: null });
    pending.add(event.id);
  }
  const next: LocalSnapshot = {
    ...current,
    records: records.values().toArray(),
    pendingIds: [...pending],
  };
  return canReplaySnapshot(next) ? ok(next) : err("history/rebuild-required");
};

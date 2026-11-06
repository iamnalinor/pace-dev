import { err, newId, ok, type Result } from "@pace/core";

import type { InstallBootstrap, LocalSnapshot, RebuildError } from "./checkpoint-store-types.ts";

import {
  canReplaySnapshot,
  isOrderedPage,
  isSameCopy,
  mergeRecords,
} from "./checkpoint-store-common.ts";

const canInstallCursor = (
  current: LocalSnapshot,
  input: InstallBootstrap,
  isForeign: boolean,
): boolean =>
  current.cursor <= input.guard.cursor &&
  (isForeign || input.seq >= current.cursor) &&
  input.seq >= input.checkpoint.value.coveredSeq &&
  isOrderedPage(input.records, input.checkpoint.value.coveredSeq, input.seq);
const hasCompletePrefix = (current: LocalSnapshot, input: InstallBootstrap): boolean => {
  if (
    current.coverage !== "full" ||
    current.storeId !== input.checkpoint.value.storeId ||
    current.cursor < input.seq
  ) {
    return false;
  }
  const resident = new Set(
    current.records
      .filter((record) => !current.pendingIds.includes(record.event.id))
      .map((record) => record.event.id),
  );
  return input.checkpoint.value.eventIds.every((id) => resident.has(id));
};
/** Called inside the adapter's single write transaction against the then-current image. */
export const bootstrapSnapshot = (
  current: LocalSnapshot,
  input: InstallBootstrap,
): Result<LocalSnapshot, RebuildError> => {
  if (!isSameCopy(current, input.guard)) {
    return err("sync/copy-changed");
  }
  const isForeign = current.storeId !== null && current.storeId !== input.checkpoint.value.storeId;
  if (!canInstallCursor(current, input, isForeign)) {
    return err("history/rebuild-required");
  }
  const pending = isForeign
    ? []
    : current.records.filter((record) => current.pendingIds.includes(record.event.id));
  if (pending.some((record) => input.checkpoint.value.eventIds.includes(record.event.id))) {
    return err("history/rebuild-required");
  }
  if (hasCompletePrefix(current, input)) {
    return ok(current);
  }
  const received = new Set(input.records.map((record) => record.event.id));
  const next: LocalSnapshot = {
    ...current,
    copyToken: isForeign ? newId() : current.copyToken,
    storeId: input.checkpoint.value.storeId,
    cursor: input.seq,
    syncVersion: input.syncVersion,
    checkpoint: input.checkpoint,
    coverage: "checkpoint",
    records: mergeRecords(pending, input.records),
    pendingIds: pending.map((record) => record.event.id).filter((id) => !received.has(id)),
  };
  return canReplaySnapshot(next) ? ok(next) : err("history/rebuild-required");
};

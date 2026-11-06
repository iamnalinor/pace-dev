import { err, ok, type Result } from "@pace/core";

import type {
  ApplyRemotePage,
  InstallHistory,
  LocalSnapshot,
  RebuildError,
} from "./checkpoint-store-types.ts";

import {
  canReplaySnapshot,
  isOrderedPage,
  isSameCopy,
  mergeRecords,
  snapshotForGeneration,
} from "./checkpoint-store-common.ts";

export { appendLocalSnapshot } from "./checkpoint-store-append.ts";
export { bootstrapSnapshot } from "./checkpoint-store-bootstrap.ts";
export { emptySnapshot, isSameCopy } from "./checkpoint-store-common.ts";

export const remotePageSnapshot = (
  previous: LocalSnapshot,
  input: ApplyRemotePage,
): Result<LocalSnapshot, RebuildError> => {
  if (!isSameCopy(previous, input.guard)) {
    return err("sync/copy-changed");
  }
  const generation = snapshotForGeneration(previous, input);
  if (!generation.ok) {
    return generation;
  }
  const current = generation.value;
  if (input.seq <= current.cursor) {
    return ok(current.storeId === null ? { ...current, storeId: input.storeId } : current);
  }
  if (input.since !== current.cursor || !isOrderedPage(input.records, input.since, input.seq)) {
    return err("history/rebuild-required");
  }
  const received = new Set(input.records.map((record) => record.event.id));
  const next: LocalSnapshot = {
    ...current,
    storeId: input.storeId,
    cursor: input.seq,
    records: mergeRecords(current.records, input.records),
    pendingIds: current.pendingIds.filter((id) => !received.has(id)),
  };
  return canReplaySnapshot(next) ? ok(next) : err("history/rebuild-required");
};
const hasKnownSourceIds = (
  current: LocalSnapshot,
  input: InstallHistory,
  ids: ReadonlySet<string>,
): boolean => {
  const known = [
    ...(current.checkpoint?.value.eventIds ?? []),
    ...current.records
      .filter((record) => record.seq !== null && record.seq <= input.through)
      .map((record) => record.event.id),
  ];
  return known.every((id) => ids.has(id));
};
const isCompletePrefix = (
  current: LocalSnapshot,
  input: InstallHistory,
  ids: ReadonlySet<string>,
): boolean =>
  isOrderedPage(input.sourceRecords, 0, input.through) &&
  input.through >= (current.checkpoint?.value.coveredSeq ?? 0) &&
  hasKnownSourceIds(current, input, ids);
export const historySnapshot = (
  current: LocalSnapshot,
  input: InstallHistory,
): Result<LocalSnapshot, "history/incomplete" | "sync/copy-changed"> => {
  if (!isSameCopy(current, input.guard)) {
    return err("sync/copy-changed");
  }
  const ids = new Set(input.sourceRecords.map((record) => record.event.id));
  if (!isCompletePrefix(current, input, ids)) {
    return err("history/incomplete");
  }
  const later = current.records.filter(
    (record) => record.seq === null || record.seq > input.through,
  );
  return ok({
    ...current,
    checkpoint: null,
    coverage: "full",
    records: mergeRecords(later, input.sourceRecords),
    pendingIds: current.pendingIds.filter((id) => !ids.has(id)),
  });
};

export { legacyPageSnapshot } from "./checkpoint-store-legacy.ts";

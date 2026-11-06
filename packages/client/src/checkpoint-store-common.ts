import {
  err,
  newId,
  ok,
  replayCheckpoint,
  type Result,
  type SequencedCheckpointEvent,
} from "@pace/core";

import type { CopyGuard, LocalRecord, LocalSnapshot } from "./checkpoint-store-types.ts";

export const emptySnapshot = (): LocalSnapshot => ({
  copyToken: newId(),
  owner: null,
  storeId: null,
  cursor: 0,
  syncVersion: 0,
  checkpoint: null,
  coverage: "full",
  records: [],
  pendingIds: [],
});
export const isSameCopy = (current: LocalSnapshot, guard: CopyGuard): boolean =>
  current.copyToken === guard.copyToken &&
  current.owner === guard.owner &&
  current.storeId === guard.storeId;
export const mergeRecords = (
  before: readonly LocalRecord[],
  incoming: readonly LocalRecord[],
): readonly LocalRecord[] =>
  new Map([...before, ...incoming].map((record) => [record.event.id, record])).values().toArray();
export const isOrderedPage = (
  records: readonly SequencedCheckpointEvent[],
  since: number,
  seq: number,
): boolean =>
  seq >= since &&
  new Set(records.map((record) => record.event.id)).size === records.length &&
  records.every(
    (record, index) => record.seq > (records[index - 1]?.seq ?? since) && record.seq <= seq,
  ) &&
  (records.at(-1)?.seq ?? since) === seq;
export const canReplaySnapshot = (snapshot: LocalSnapshot): boolean => {
  const checkpoint = snapshot.checkpoint;
  if (checkpoint === null) {
    return snapshot.coverage === "full";
  }
  const synced = snapshot.records
    .filter((record): record is SequencedCheckpointEvent => record.seq !== null)
    .toSorted((a, b) => a.seq - b.seq);
  const pending = snapshot.records
    .filter((record) => record.seq === null)
    .map((record, index) => ({
      event: record.event,
      seq: Math.max(snapshot.cursor, checkpoint.value.coveredSeq) + index + 1,
    }));
  return replayCheckpoint(checkpoint.value, [...synced, ...pending]).ok;
};
export const snapshotForGeneration = (
  previous: LocalSnapshot,
  input: {
    readonly storeId: string;
    readonly since: number;
    readonly shouldResetUnconfirmed?: boolean;
  },
): Result<LocalSnapshot, "sync/copy-changed"> => {
  const isForeign =
    (previous.storeId !== null && previous.storeId !== input.storeId) ||
    (input.shouldResetUnconfirmed === true && previous.storeId === null && previous.cursor > 0);
  if (isForeign && input.since !== 0) {
    return err("sync/copy-changed");
  }
  return ok(
    isForeign
      ? {
          ...emptySnapshot(),
          owner: previous.owner,
          storeId: input.storeId,
          syncVersion: previous.syncVersion,
        }
      : previous,
  );
};

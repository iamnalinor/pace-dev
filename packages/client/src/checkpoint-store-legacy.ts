import { err, ok, type Result } from "@pace/core";

import type {
  ApplyLegacyPage,
  CopyMeta,
  LegacyPageChange,
  LocalSnapshot,
  RebuildError,
} from "./checkpoint-store-types.ts";

import {
  copyMeta,
  isSameCopy,
  mergeRecords,
  snapshotForGeneration,
} from "./checkpoint-store-common.ts";
import { COPY_CHANGED, REBUILD_REQUIRED } from "./sync-error.ts";

type Paged = Pick<LegacyPageChange, "events" | "isConverted" | "meta">;

const upgradeMeta = (
  current: CopyMeta,
  input: ApplyLegacyPage,
): null | Result<Paged, RebuildError> => {
  if (input.syncVersion === undefined || input.syncVersion <= current.syncVersion) {
    return null;
  }
  if (current.cursor !== input.guard.cursor) {
    return err(REBUILD_REQUIRED);
  }
  const isRewind =
    current.storeId !== null && input.since === 0 && input.seq === 0 && input.events.length === 0;
  return isRewind
    ? ok({
        meta: { ...current, cursor: 0, syncVersion: input.syncVersion },
        events: [],
        isConverted: false,
      })
    : null;
};
/**
A copy built on a checkpoint takes a legacy page only from the log's start: the page replaces the
base and what was pulled on top of it, and the copy is a full one from there on (the server
stopped offering checkpoints, PR 55 review I1). Its outbox is not the server's to replace.
*/
const convertPage = (current: CopyMeta, input: ApplyLegacyPage): Result<Paged, RebuildError> =>
  input.since === 0
    ? ok({
        meta: {
          ...current,
          coverage: "full",
          storeId: input.storeId,
          cursor: input.seq,
          syncVersion: Math.max(current.syncVersion, input.syncVersion ?? 0),
        },
        events: input.events,
        isConverted: true,
      })
    : err(REBUILD_REQUIRED);
const applyPage = (current: CopyMeta, input: ApplyLegacyPage): Result<Paged, RebuildError> => {
  if (current.coverage !== "full") {
    return convertPage(current, input);
  }
  const upgrade = upgradeMeta(current, input);
  if (upgrade !== null) {
    return upgrade;
  }
  if (input.seq < current.cursor) {
    return ok({ meta: current, events: [], isConverted: false });
  }
  if (input.since !== current.cursor || input.seq < input.since) {
    return err(REBUILD_REQUIRED);
  }
  return ok({
    meta: {
      ...current,
      storeId: input.storeId,
      cursor: input.seq,
      syncVersion: Math.max(current.syncVersion, input.syncVersion ?? 0),
    },
    events: input.events,
    isConverted: false,
  });
};
/**
Legacy envelopes carry no original sequence; their page boundary is committed with them. The
change depends on the copy's meta only, so an adapter decides it inside its transaction without
reading the log (bug-lessons class 259).
*/
export const legacyPageChange = (
  previous: CopyMeta,
  input: ApplyLegacyPage,
): Result<LegacyPageChange, RebuildError> => {
  if (!isSameCopy(previous, input.guard)) {
    return err(COPY_CHANGED);
  }
  const generation = snapshotForGeneration(
    { ...copyMeta(previous), checkpoint: null, records: [], pendingIds: [] },
    { storeId: input.storeId, since: input.since, shouldResetUnconfirmed: true },
  );
  if (!generation.ok) {
    return generation;
  }
  const paged = applyPage(copyMeta(generation.value), input);
  return paged.ok
    ? ok({ ...paged.value, isReplaced: generation.value.copyToken !== previous.copyToken })
    : paged;
};
/** What a legacy page leaves of the stored records: nothing, the outbox alone, or all of them. */
const keptRecords = (
  current: LocalSnapshot,
  change: LegacyPageChange,
): LocalSnapshot["records"] => {
  if (change.isReplaced) {
    return [];
  }
  if (!change.isConverted) {
    return current.records;
  }
  const pending = new Set(current.pendingIds);
  return current.records.filter((record) => pending.has(record.event.id));
};
/** The whole copy after a legacy page's change (the memory store; adapters write the delta). */
export const withLegacyPage = (current: LocalSnapshot, change: LegacyPageChange): LocalSnapshot => {
  const received = new Set(change.events.map((event) => event.id));
  return {
    ...change.meta,
    checkpoint: null,
    records: mergeRecords(
      keptRecords(current, change),
      change.events.map((event) => ({ event, seq: null })),
    ),
    pendingIds: change.isReplaced ? [] : current.pendingIds.filter((id) => !received.has(id)),
  };
};

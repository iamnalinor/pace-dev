import { err, ok, type Result } from "@pace/core";

import type { ApplyLegacyPage, LocalSnapshot, RebuildError } from "./checkpoint-store-types.ts";

import { isSameCopy, mergeRecords, snapshotForGeneration } from "./checkpoint-store-common.ts";

const upgradeSnapshot = (
  current: LocalSnapshot,
  input: ApplyLegacyPage,
): null | Result<LocalSnapshot, RebuildError> => {
  if (input.syncVersion === undefined || input.syncVersion <= current.syncVersion) {
    return null;
  }
  if (current.cursor !== input.guard.cursor) {
    return err("history/rebuild-required");
  }
  const isRewind =
    current.storeId !== null && input.since === 0 && input.seq === 0 && input.events.length === 0;
  return isRewind ? ok({ ...current, cursor: 0, syncVersion: input.syncVersion }) : null;
};
const applyPage = (
  current: LocalSnapshot,
  input: ApplyLegacyPage,
): Result<LocalSnapshot, RebuildError> => {
  if (current.coverage !== "full") {
    return err("history/rebuild-required");
  }
  const upgrade = upgradeSnapshot(current, input);
  if (upgrade !== null) {
    return upgrade;
  }
  if (input.seq < current.cursor) {
    return ok(current);
  }
  if (input.since !== current.cursor || input.seq < input.since) {
    return err("history/rebuild-required");
  }
  const received = new Set(input.events.map((event) => event.id));
  return ok({
    ...current,
    storeId: input.storeId,
    cursor: input.seq,
    syncVersion: Math.max(current.syncVersion, input.syncVersion ?? 0),
    records: mergeRecords(
      current.records,
      input.events.map((event) => ({ event, seq: null })),
    ),
    pendingIds: current.pendingIds.filter((id) => !received.has(id)),
  });
};
/** Legacy envelopes carry no original sequence; commit their actual page boundary separately. */
export const legacyPageSnapshot = (
  previous: LocalSnapshot,
  input: ApplyLegacyPage,
): Result<LocalSnapshot, RebuildError> => {
  if (!isSameCopy(previous, input.guard)) {
    return err("sync/copy-changed");
  }
  const generation = snapshotForGeneration(previous, {
    storeId: input.storeId,
    since: input.since,
    shouldResetUnconfirmed: true,
  });
  if (!generation.ok) {
    return generation;
  }
  const current = generation.value;
  return applyPage(current, input);
};

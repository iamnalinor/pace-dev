import {
  canAppendToCopy,
  COPY_CHANGED,
  type CopyGuard,
  type CopyMeta,
  type LegacyPageChange,
  type LocalRecord,
  type LocalSnapshot,
  type Sha256Text,
  SyncError,
  validateCheckpoint,
  type ValidatedCheckpoint,
} from "@pace/client";
import { type Event, newId } from "@pace/core";

/** The `meta` table as stored: the copy's identity, cursor, version and checkpoint. */
export type StoredMeta = Readonly<Record<string, string>>;
export type StoredImage = {
  readonly meta: StoredMeta;
  readonly records: readonly LocalRecord[];
  readonly pendingIds: readonly string[];
};
export type StoredDelta = {
  readonly records: readonly LocalRecord[];
  readonly deleted: readonly string[];
  readonly pendingAdded: readonly string[];
  readonly pendingRemoved: readonly string[];
  readonly meta: StoredMeta;
  readonly metaRemoved: readonly string[];
};

const snapshotMeta = (snapshot: CopyMeta & Pick<LocalSnapshot, "checkpoint">): StoredMeta => ({
  copyToken: snapshot.copyToken,
  cursor: String(snapshot.cursor),
  syncVersion: String(snapshot.syncVersion),
  coverage: snapshot.coverage,
  ...(snapshot.owner !== null && { owner: snapshot.owner }),
  ...(snapshot.storeId !== null && { storeId: snapshot.storeId }),
  ...(snapshot.checkpoint !== null && {
    checkpointJson: snapshot.checkpoint.json,
    checkpointSha256: snapshot.checkpoint.sha256,
  }),
});

export const isSameStoredBase = (left: StoredMeta, right: StoredMeta): boolean =>
  ["checkpointJson", "checkpointSha256", "coverage"].every((key) => left[key] === right[key]);

export const storedCheckpoint = async (
  meta: StoredMeta,
  hash: Sha256Text,
): Promise<null | ValidatedCheckpoint> => {
  const { checkpointJson, checkpointSha256, storeId } = meta;
  if (checkpointJson === undefined || checkpointSha256 === undefined || storeId === undefined) {
    return null;
  }
  const parsed = await validateCheckpoint(
    { json: checkpointJson, sha256: checkpointSha256, storeId },
    hash,
  );
  return parsed.ok ? parsed.value : null;
};

export const storedCounter = (value: null | number | string | undefined): number => {
  const counter = Number(value ?? 0);
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new Error("storage/invalid-counter");
  }
  return counter;
};

/** The copy without its log, from the `meta` table alone: what a guard is compared with. */
export const storedMeta = (meta: StoredMeta): CopyMeta => {
  const copyToken = meta["copyToken"];
  if (copyToken === undefined) {
    throw new Error("storage/copy-identity-missing");
  }
  return {
    copyToken,
    owner: meta["owner"] ?? null,
    storeId: meta["storeId"] ?? null,
    cursor: storedCounter(meta["cursor"]),
    syncVersion: storedCounter(meta["syncVersion"]),
    coverage:
      meta["coverage"] === "checkpoint" ||
      meta["checkpointJson"] !== undefined ||
      meta["checkpointSha256"] !== undefined
        ? "checkpoint"
        : "full",
  };
};

export const storedSnapshot = (
  image: StoredImage,
  checkpoint: null | ValidatedCheckpoint,
): LocalSnapshot => ({
  ...storedMeta(image.meta),
  checkpoint,
  records: image.records,
  pendingIds: image.pendingIds,
});

const isChangedRecord = (previous: LocalRecord | undefined, record: LocalRecord): boolean =>
  previous !== record &&
  (previous?.seq !== record.seq || JSON.stringify(previous.event) !== JSON.stringify(record.event));

const metaDelta = (
  before: StoredMeta,
  after: StoredMeta,
): Pick<StoredDelta, "meta" | "metaRemoved"> => ({
  meta: Object.fromEntries(Object.entries(after).filter(([key, value]) => before[key] !== value)),
  metaRemoved: Object.keys(before).filter((key) => !Object.hasOwn(after, key)),
});

export const imageDelta = (before: StoredImage, after: LocalSnapshot): StoredDelta => {
  const previous = new Map(before.records.map((record) => [record.event.id, record]));
  const next = new Set(after.records.map((record) => record.event.id));
  const pendingBefore = new Set(before.pendingIds);
  const pendingAfter = new Set(after.pendingIds);
  return {
    records: after.records.filter((record) =>
      isChangedRecord(previous.get(record.event.id), record),
    ),
    deleted: before.records
      .filter((record) => !next.has(record.event.id))
      .map((record) => record.event.id),
    pendingAdded: after.pendingIds.filter((id) => !pendingBefore.has(id)),
    pendingRemoved: before.pendingIds.filter((id) => !pendingAfter.has(id)),
    ...metaDelta(before.meta, snapshotMeta(after)),
  };
};

/**
What a legacy page writes, from the `meta` table and the page alone (class 259): its events as
acknowledged, unsequenced records and the new meta. A replaced copy's log is dropped by the
adapter before this is written.
*/
export const legacyPageDelta = (before: StoredMeta, change: LegacyPageChange): StoredDelta => ({
  records: change.events.map((event) => ({ event, seq: null })),
  deleted: [],
  pendingAdded: [],
  pendingRemoved: change.events.map((event) => event.id),
  ...metaDelta(before, snapshotMeta({ ...change.meta, checkpoint: null })),
});

/**
Whether a guarded append is plain inserts: the guard holds (it throws otherwise) and no checkpoint
covers the copy. Decided from the `meta` table inside the write's own transaction (class 259).
*/
export const canInsertGuarded = (meta: StoredMeta, guard: CopyGuard): boolean => {
  const copy = storedMeta(meta);
  if (!canAppendToCopy(copy, guard)) {
    throw new SyncError(COPY_CHANGED);
  }
  return copy.coverage === "full";
};

export const newCopyToken = (): string => newId();
export const compareStoredEvents = (left: Event, right: Event): number => {
  const order = left.occurredAt.localeCompare(right.occurredAt);
  return order === 0 ? left.id.localeCompare(right.id) : order;
};

export const isStoredCopy = (
  meta: Readonly<Record<string, string | undefined>>,
  guard: CopyGuard,
): boolean =>
  meta["copyToken"] === guard.copyToken &&
  (meta["owner"] ?? null) === guard.owner &&
  (meta["storeId"] ?? null) === guard.storeId;

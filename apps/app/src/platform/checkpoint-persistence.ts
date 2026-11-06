import {
  type CopyGuard,
  type LocalRecord,
  type LocalSnapshot,
  type Sha256Text,
  validateCheckpoint,
  type ValidatedCheckpoint,
} from "@pace/client";
import { type Event, newId } from "@pace/core";

export type StoredImage = {
  readonly meta: Readonly<Record<string, string>>;
  readonly records: readonly LocalRecord[];
  readonly pendingIds: readonly string[];
};
export type StoredDelta = {
  readonly records: readonly LocalRecord[];
  readonly deleted: readonly string[];
  readonly pendingAdded: readonly string[];
  readonly pendingRemoved: readonly string[];
  readonly meta: Readonly<Record<string, string>>;
  readonly metaRemoved: readonly string[];
};

export const snapshotMeta = (snapshot: LocalSnapshot): Readonly<Record<string, string>> => ({
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

export const isSameStoredBase = (left: StoredImage, right: StoredImage): boolean =>
  ["checkpointJson", "checkpointSha256", "coverage"].every(
    (key) => left.meta[key] === right.meta[key],
  );

export const storedCheckpoint = async (
  image: StoredImage,
  hash: Sha256Text,
): Promise<null | ValidatedCheckpoint> => {
  const { checkpointJson, checkpointSha256, storeId } = image.meta;
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

export const storedSnapshot = (
  image: StoredImage,
  checkpoint: null | ValidatedCheckpoint,
): LocalSnapshot => {
  const copyToken = image.meta["copyToken"];
  if (copyToken === undefined) {
    throw new Error("storage/copy-identity-missing");
  }
  return {
    copyToken,
    owner: image.meta["owner"] ?? null,
    storeId: image.meta["storeId"] ?? null,
    cursor: storedCounter(image.meta["cursor"]),
    syncVersion: storedCounter(image.meta["syncVersion"]),
    checkpoint,
    coverage:
      image.meta["coverage"] === "checkpoint" ||
      image.meta["checkpointJson"] !== undefined ||
      image.meta["checkpointSha256"] !== undefined
        ? "checkpoint"
        : "full",
    records: image.records,
    pendingIds: image.pendingIds,
  };
};

const isChangedRecord = (previous: LocalRecord | undefined, record: LocalRecord): boolean =>
  previous !== record &&
  (previous?.seq !== record.seq || JSON.stringify(previous.event) !== JSON.stringify(record.event));

export const imageDelta = (before: StoredImage, after: LocalSnapshot): StoredDelta => {
  const previous = new Map(before.records.map((record) => [record.event.id, record]));
  const next = new Map(after.records.map((record) => [record.event.id, record]));
  const meta = snapshotMeta(after);
  return {
    records: after.records.filter((record) =>
      isChangedRecord(previous.get(record.event.id), record),
    ),
    deleted: before.records
      .filter((record) => !next.has(record.event.id))
      .map((record) => record.event.id),
    pendingAdded: after.pendingIds.filter((id) => !before.pendingIds.includes(id)),
    pendingRemoved: before.pendingIds.filter((id) => !after.pendingIds.includes(id)),
    meta: Object.fromEntries(
      Object.entries(meta).filter(([key, value]) => before.meta[key] !== value),
    ),
    metaRemoved: Object.keys(before.meta).filter((key) => !Object.hasOwn(meta, key)),
  };
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

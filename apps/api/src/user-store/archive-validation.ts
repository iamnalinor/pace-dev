import { err, ok, type Result } from "@pace/core";

import {
  type ArchiveCapture,
  type ArchiveIdentity,
  type ArchiveRecord,
  ArchiveRecordSchema,
} from "./archive-types.ts";

const compareText = (left: string, right: string): number =>
  left < right ? -1 : Number(left > right);
const rawKey = (record: Exclude<ArchiveRecord, { kind: "event" }>): string =>
  JSON.stringify(
    record.kind === "usage"
      ? [record.row.deviceId, record.row.app, record.row.startAt]
      : [record.row.deviceId, record.row.startAt],
  );

const compareRecord = (left: ArchiveRecord, right: ArchiveRecord): number => {
  if (left.kind === "event" && right.kind === "event") {
    return left.seq - right.seq;
  }
  if (left.kind !== "event" && left.kind === right.kind) {
    return compareText(rawKey(left), rawKey(right));
  }
  const rank = { event: 0, usage: 1, "phone-use": 2 };
  return rank[left.kind] - rank[right.kind];
};

const doesFitCapture = (record: ArchiveRecord, capture: ArchiveCapture): boolean => {
  return record.kind === "event"
    ? record.seq <= capture.capturedThroughSeq &&
        record.row.occurredAt.slice(0, 7) === capture.month
    : record.revision <= capture.rawRevision && record.row.startAt.slice(0, 7) === capture.month;
};

const hasUniqueRecords = (records: readonly ArchiveRecord[]): boolean => {
  const ids = new Set<string>();
  const seqs = new Set<number>();
  const keys = new Set<string>();
  for (const record of records) {
    if (record.kind === "event") {
      if (ids.has(record.row.id) || seqs.has(record.seq)) {
        return false;
      }
      ids.add(record.row.id);
      seqs.add(record.seq);
    } else {
      const key = `${record.kind}:${rawKey(record)}`;
      if (keys.has(key)) {
        return false;
      }
      keys.add(key);
    }
  }
  return true;
};

export const validateArchiveRecords = (
  records: unknown,
  capture: ArchiveCapture,
): Result<readonly ArchiveRecord[], "archive/invalid"> => {
  const parsed = ArchiveRecordSchema.array().safeParse(records);
  return parsed.success &&
    parsed.data.every((record) => doesFitCapture(record, capture)) &&
    hasUniqueRecords(parsed.data)
    ? ok(parsed.data.toSorted(compareRecord))
    : err("archive/invalid");
};

export const archiveSummary = (
  records: readonly ArchiveRecord[],
): {
  readonly counts: { readonly events: number; readonly usage: number; readonly phoneUses: number };
  readonly minSeq: null | number;
  readonly maxSeq: null | number;
} => {
  const seqs = records.flatMap((record) => (record.kind === "event" ? record.seq : []));
  return {
    counts: {
      events: seqs.length,
      usage: records.filter((record) => record.kind === "usage").length,
      phoneUses: records.filter((record) => record.kind === "phone-use").length,
    },
    minSeq: seqs[0] ?? null,
    maxSeq: seqs.at(-1) ?? null,
  };
};

/** Identities occupy exactly one path segment, including dots and slashes. */
const segment = (value: string): string => encodeURIComponent(value).replaceAll(".", "%2E");
export const archivePrefix = (identity: Pick<ArchiveIdentity, "owner" | "storeId">): string =>
  `history/v1/${segment(identity.owner)}/${segment(identity.storeId)}/`;
export const archiveDataKey = (identity: ArchiveIdentity, hash: string): string =>
  `${archivePrefix(identity)}months/${identity.month}/${hash}.jsonl.gz`;
export const archiveJsonl = (records: readonly ArchiveRecord[]): string =>
  records.map((record) => `${JSON.stringify(record)}\n`).join("");

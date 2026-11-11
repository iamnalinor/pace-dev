import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

import type { ArchiveStore } from "../shared/ports/archive-store.ts";
import type { ArchiveOperation } from "./archive-repository.ts";
import type { ArchiveError } from "./archive-service.ts";
import type { ArchiveSource } from "./archive-source.ts";

import { sha256BytesHex } from "../shared/crypto.ts";
import { verifyArchiveMonth } from "./archive-codec.ts";
import {
  type ArchiveManifest,
  ArchiveManifestSchema,
  type ArchiveRecord,
  ArchiveRecordSchema,
} from "./archive-types.ts";
import { archiveDataKey, archivePrefix, rawIdentity } from "./archive-validation.ts";

export type ArchiveSet = {
  readonly version: 1;
  readonly owner: string;
  readonly storeId: string;
  readonly sourceSchemaTag: string;
  readonly sourceHighSeq: number;
  readonly rawRevision: number;
  readonly counts: { readonly events: number; readonly usage: number; readonly phoneUses: number };
  readonly inventoryHash: string;
  readonly months: readonly {
    readonly month: string;
    readonly manifestKey: string;
    readonly manifestHash: string;
  }[];
};
const canonicalRecords = (records: readonly ArchiveRecord[]): readonly ArchiveRecord[] =>
  records.toSorted((left, right) => {
    if (left.kind === "event" && right.kind === "event") {
      return left.seq - right.seq;
    }
    if (left.kind === "event") {
      return -1;
    }
    if (right.kind === "event") {
      return 1;
    }
    const leftKey = `${left.kind}:${rawIdentity(left)}`;
    const rightKey = `${right.kind}:${rawIdentity(right)}`;
    return leftKey < rightKey ? -1 : Number(leftKey > rightKey);
  });
const inventory = async (records: readonly ArchiveRecord[]): Promise<string> => {
  const normalized = records.map((record) => ArchiveRecordSchema.parse(record));
  const text = JSON.stringify(canonicalRecords(normalized));
  return await sha256BytesHex(new TextEncoder().encode(text));
};
const countsOf = (records: readonly ArchiveRecord[]) => ({
  events: records.filter((row) => row.kind === "event").length,
  usage: records.filter((row) => row.kind === "usage").length,
  phoneUses: records.filter((row) => row.kind === "phone-use").length,
});

/** Exact source inventory proves allocated cursors; SQLite can legitimately burn numeric seq values. */
export const createArchiveSet = async (input: {
  readonly owner: string;
  readonly storeId: string;
  readonly sourceSchemaTag: string;
  readonly source: ArchiveSource;
  readonly selected: readonly ArchiveOperation[];
}): Promise<ArchiveSet> => ({
  version: 1,
  owner: input.owner,
  storeId: input.storeId,
  sourceSchemaTag: input.sourceSchemaTag,
  sourceHighSeq: input.source.sourceHighSeq,
  rawRevision: input.source.rawRevision,
  counts: countsOf(input.source.records),
  inventoryHash: await inventory(input.source.records),
  months: input.selected.map((operation) => ({
    month: operation.prepared.manifest.month,
    manifestKey: operation.prepared.manifestKey,
    manifestHash: operation.id,
  })),
});

const decodeManifest = (bytes: Uint8Array) => {
  try {
    return ArchiveManifestSchema.safeParse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch {
    return ArchiveManifestSchema.safeParse(undefined);
  }
};
const isSelectedManifest = (
  manifest: ArchiveManifest,
  set: ArchiveSet,
  selected: ArchiveSet["months"][number],
): boolean =>
  manifest.owner === set.owner &&
  manifest.storeId === set.storeId &&
  manifest.month === selected.month &&
  manifest.sourceSchemaTag === set.sourceSchemaTag &&
  manifest.capturedThroughSeq <= set.sourceHighSeq &&
  manifest.rawRevision <= set.rawRevision &&
  manifest.dataKey === archiveDataKey(manifest, manifest.compressedSha256);

const readManifest = async (
  archive: ArchiveStore,
  set: ArchiveSet,
  selected: ArchiveSet["months"][number],
): Promise<Result<ArchiveManifest, ArchiveError>> => {
  if (selected.manifestKey !== `${archivePrefix(set)}manifests/${selected.manifestHash}.json`) {
    return err("archive/integrity");
  }
  const remote = await archive.get(selected.manifestKey);
  if (!remote.ok) {
    return remote;
  }
  if (remote.value === null || (await sha256BytesHex(remote.value)) !== selected.manifestHash) {
    return err("archive/integrity");
  }
  const parsed = decodeManifest(remote.value);
  return parsed.success && isSelectedManifest(parsed.data, set, selected)
    ? ok(parsed.data)
    : err("archive/integrity");
};

const readMonth = async (
  archive: ArchiveStore,
  set: ArchiveSet,
  selected: ArchiveSet["months"][number],
): Promise<Result<readonly ArchiveRecord[], ArchiveError>> => {
  const manifest = await readManifest(archive, set, selected);
  if (!manifest.ok) {
    return manifest;
  }
  const bytes = await archive.get(manifest.value.dataKey);
  if (!bytes.ok) {
    return bytes;
  }
  if (bytes.value === null) {
    return err("archive/integrity");
  }
  const verified = await verifyArchiveMonth(manifest.value, bytes.value, manifest.value);
  return verified.ok ? ok(verified.value.records) : verified;
};

type EventRecord = Extract<ArchiveRecord, { kind: "event" }>;
type RawRecord = Exclude<ArchiveRecord, { kind: "event" }>;
type EventIndex = { readonly events: Map<string, EventRecord>; readonly seqs: Map<number, string> };
const mergeEvent = (
  index: EventIndex,
  set: ArchiveSet,
  record: EventRecord,
): Result<void, "archive/integrity"> => {
  const old = index.events.get(record.row.id);
  if (
    record.seq > set.sourceHighSeq ||
    (old !== undefined && JSON.stringify(old) !== JSON.stringify(record)) ||
    (index.seqs.has(record.seq) && index.seqs.get(record.seq) !== record.row.id)
  ) {
    return err("archive/integrity");
  }
  index.events.set(record.row.id, record);
  index.seqs.set(record.seq, record.row.id);
  return ok(undefined);
};
const mergeRaw = (
  raw: Map<string, RawRecord>,
  set: ArchiveSet,
  record: RawRecord,
): Result<void, "archive/integrity"> => {
  const key = `${record.kind}:${rawIdentity(record)}`;
  const old = raw.get(key);
  if (
    record.revision > set.rawRevision ||
    (old?.revision === record.revision && JSON.stringify(old) !== JSON.stringify(record))
  ) {
    return err("archive/integrity");
  }
  if (old === undefined || record.revision > old.revision) {
    raw.set(key, record);
  }
  return ok(undefined);
};

const mergeRecords = (
  set: ArchiveSet,
  records: readonly ArchiveRecord[],
): Result<readonly ArchiveRecord[], "archive/integrity"> => {
  const index: EventIndex = { events: new Map(), seqs: new Map() };
  const raw = new Map<string, RawRecord>();
  for (const record of records) {
    const merged =
      record.kind === "event" ? mergeEvent(index, set, record) : mergeRaw(raw, set, record);
    if (!merged.ok) {
      return merged;
    }
  }
  return ok(canonicalRecords([...index.events.values(), ...raw.values()]));
};
const verifyInventory = async (
  set: ArchiveSet,
  records: readonly ArchiveRecord[],
): Promise<Result<readonly ArchiveRecord[], ArchiveError>> => {
  const parsed = z.array(ArchiveRecordSchema).safeParse(records);
  if (!parsed.success) {
    return err("archive/integrity");
  }
  const merged = mergeRecords(set, parsed.data);
  if (!merged.ok) {
    return merged;
  }
  if (
    JSON.stringify(countsOf(merged.value)) !== JSON.stringify(set.counts) ||
    (await inventory(merged.value)) !== set.inventoryHash
  ) {
    return err("archive/integrity");
  }
  const last = merged.value.findLast((record) => record.kind === "event");
  return (last?.seq ?? 0) === set.sourceHighSeq ? merged : err("archive/integrity");
};

/** Archive-backed requests fail explicitly; retained-source ordinary readers keep their own path. */
export const readArchiveHistory = async (input: {
  readonly set: ArchiveSet;
  readonly archive: ArchiveStore;
  readonly retainedComplement: readonly ArchiveRecord[];
}): Promise<Result<readonly ArchiveRecord[], ArchiveError>> => {
  const months = input.set.months.map((month) => month.month);
  if (new Set(months).size !== months.length) {
    return err("archive/integrity");
  }
  const records: ArchiveRecord[] = [...input.retainedComplement];
  for (const selected of input.set.months) {
    const result = await readMonth(input.archive, input.set, selected);
    if (!result.ok) {
      return result;
    }
    records.push(...result.value);
  }
  return await verifyInventory(input.set, records);
};

const HistoryBoundsSchema = z
  .object({
    after: z.number().int().nonnegative(),
    through: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(500),
  })
  .refine((bounds) => bounds.after <= bounds.through);

export const readHistoryPage = async (input: {
  readonly set: ArchiveSet;
  readonly archive: ArchiveStore;
  readonly retainedComplement: readonly ArchiveRecord[];
  readonly after: number;
  readonly through: number;
  readonly limit: number;
}): Promise<
  Result<
    {
      readonly records: readonly Extract<ArchiveRecord, { kind: "event" }>[];
      readonly more: boolean;
      readonly seq: number;
    },
    ArchiveError
  >
> => {
  if (!HistoryBoundsSchema.safeParse(input).success || input.through > input.set.sourceHighSeq) {
    return err("archive/invalid");
  }
  const result = await readArchiveHistory(input);
  if (!result.ok) {
    return result;
  }
  const rows = result.value.filter(
    (record): record is Extract<ArchiveRecord, { kind: "event" }> =>
      record.kind === "event" && record.seq > input.after && record.seq <= input.through,
  );
  const page = rows.slice(0, input.limit);
  return ok({
    records: page,
    more: rows.length > input.limit,
    seq: page.at(-1)?.seq ?? input.after,
  });
};

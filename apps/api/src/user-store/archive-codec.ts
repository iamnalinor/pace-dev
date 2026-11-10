import { err, ok, type Result } from "@pace/core";

import { sha256BytesHex } from "../shared/crypto.ts";
import { ARCHIVE_MAX_BYTES, archiveCompression } from "./archive-bytes.ts";
import {
  type ArchiveCapture,
  ArchiveCaptureSchema,
  type ArchiveCodecError,
  type ArchiveIdentity,
  type ArchiveManifest,
  ArchiveManifestSchema,
  type ArchiveRecord,
  type PreparedArchiveMonth,
  type VerifiedArchiveMonth,
} from "./archive-types.ts";
import {
  archiveDataKey,
  archiveJsonl,
  archivePrefix,
  archiveSummary,
  validateArchiveRecords,
} from "./archive-validation.ts";

const encoder = new TextEncoder();

const manifestOf = async (
  capture: ArchiveCapture,
  records: readonly ArchiveRecord[],
  bytes: { readonly plain: Uint8Array; readonly compressed: Uint8Array },
): Promise<ArchiveManifest> => {
  const compressedSha256 = await sha256BytesHex(bytes.compressed);
  return {
    ...capture,
    formatVersion: 1,
    ...archiveSummary(records),
    uncompressedSha256: await sha256BytesHex(bytes.plain),
    uncompressedByteLength: bytes.plain.byteLength,
    compressedSha256,
    compressedByteLength: bytes.compressed.byteLength,
    dataKey: archiveDataKey(capture, compressedSha256),
  };
};

const prepareMonth = async (
  capture: ArchiveCapture,
  records: readonly ArchiveRecord[],
  bytes: { readonly plain: Uint8Array; readonly compressed: Uint8Array },
): Promise<PreparedArchiveMonth> => {
  const manifest = await manifestOf(capture, records, bytes);
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  const manifestKey = `${archivePrefix(capture)}manifests/${await sha256BytesHex(manifestBytes)}.json`;
  return { manifest, bytes: bytes.compressed, manifestBytes, manifestKey };
};

export const encodeArchiveMonth = async (
  input: ArchiveCapture & { readonly records: readonly ArchiveRecord[] },
): Promise<Result<PreparedArchiveMonth, ArchiveCodecError>> => {
  const { records: source, ...metadata } = input;
  const capture = ArchiveCaptureSchema.safeParse(metadata);
  if (!capture.success) {
    return err("archive/invalid");
  }
  const records = validateArchiveRecords(source, capture.data);
  if (!records.ok) {
    return records;
  }
  const plain = encoder.encode(archiveJsonl(records.value));
  if (plain.byteLength > ARCHIVE_MAX_BYTES) {
    return err("archive/too-large");
  }
  const compressed = await archiveCompression(plain, "compress");
  return compressed.ok
    ? ok(await prepareMonth(capture.data, records.value, { plain, compressed: compressed.value }))
    : compressed;
};

const isMatchingIdentity = (manifest: ArchiveManifest, expected: ArchiveIdentity): boolean =>
  manifest.owner === expected.owner &&
  manifest.storeId === expected.storeId &&
  manifest.month === expected.month;

const parseRecords = (
  bytes: Uint8Array,
  manifest: ArchiveManifest,
): Result<readonly ArchiveRecord[], "archive/integrity"> => {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const source: unknown =
      text === ""
        ? []
        : text
            .slice(0, -1)
            .split("\n")
            .map((line): unknown => JSON.parse(line));
    const records = validateArchiveRecords(source, manifest);
    if (!records.ok || archiveJsonl(records.value) !== text) {
      return err("archive/integrity");
    }
    const summary = archiveSummary(records.value);
    return JSON.stringify(summary) ===
      JSON.stringify({ counts: manifest.counts, minSeq: manifest.minSeq, maxSeq: manifest.maxSeq })
      ? ok(records.value)
      : err("archive/integrity");
  } catch {
    return err("archive/integrity");
  }
};

const verifyBytes = async (
  manifest: ArchiveManifest,
  bytes: Uint8Array,
): Promise<Result<Uint8Array, ArchiveCodecError>> => {
  if (
    bytes.byteLength !== manifest.compressedByteLength ||
    (await sha256BytesHex(bytes)) !== manifest.compressedSha256
  ) {
    return err("archive/integrity");
  }
  const plain = await archiveCompression(bytes, "decompress");
  if (!plain.ok) {
    return plain;
  }
  if (
    plain.value.byteLength !== manifest.uncompressedByteLength ||
    (await sha256BytesHex(plain.value)) !== manifest.uncompressedSha256
  ) {
    return err("archive/integrity");
  }
  return plain;
};

export const verifyArchiveMonth = async (
  input: unknown,
  bytes: Uint8Array,
  expected: ArchiveIdentity,
): Promise<Result<VerifiedArchiveMonth, ArchiveCodecError>> => {
  const parsed = ArchiveManifestSchema.safeParse(input);
  if (!parsed.success || !isMatchingIdentity(parsed.data, expected)) {
    return err("archive/integrity");
  }
  const manifest = parsed.data;
  if (manifest.dataKey !== archiveDataKey(manifest, manifest.compressedSha256)) {
    return err("archive/integrity");
  }
  if (manifest.uncompressedByteLength > ARCHIVE_MAX_BYTES || bytes.byteLength > ARCHIVE_MAX_BYTES) {
    return err("archive/too-large");
  }
  const plain = await verifyBytes(manifest, bytes);
  if (!plain.ok) {
    return plain;
  }
  const records = parseRecords(plain.value, manifest);
  return records.ok ? ok({ manifest, records: records.value }) : records;
};

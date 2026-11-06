import { z } from "zod";

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z
  .string()
  .min(1)
  .refine((value) => value.isWellFormed());
const hash = z.string().regex(/^[\da-f]{64}$/u);

/** Raw SQL envelopes deliberately accept historical types and preserve opaque payload text. */
const EventRowSchema = z.strictObject({
  id: z.string(),
  type: z.string(),
  occurredAt: z.string(),
  recordedAt: z.string(),
  deviceId: z.string(),
  precision: z.string(),
  source: z.string(),
  payload: z.string(),
});
const UsageRowSchema = z.strictObject({
  deviceId: z.string(),
  deviceName: z.string(),
  app: z.string(),
  startAt: z.string(),
  endAt: z.string(),
});
const PhoneRowSchema = z.strictObject({
  deviceId: z.string(),
  startAt: z.string(),
  endAt: z.string(),
});

export const ArchiveRecordSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("event"), seq: counter.positive(), row: EventRowSchema }),
  z.strictObject({ kind: z.literal("usage"), revision: counter, row: UsageRowSchema }),
  z.strictObject({ kind: z.literal("phone-use"), revision: counter, row: PhoneRowSchema }),
]);
export type ArchiveRecord = z.infer<typeof ArchiveRecordSchema>;

export const ArchiveIdentitySchema = z.strictObject({
  owner: text,
  storeId: text,
  month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u),
});
export type ArchiveIdentity = z.infer<typeof ArchiveIdentitySchema>;
export const ArchiveCaptureSchema = ArchiveIdentitySchema.extend({
  sourceSchemaTag: text,
  capturedThroughSeq: counter,
  rawRevision: counter,
});
export type ArchiveCapture = z.infer<typeof ArchiveCaptureSchema>;

export const ArchiveManifestSchema = ArchiveCaptureSchema.extend({
  formatVersion: z.literal(1),
  counts: z.strictObject({ events: counter, usage: counter, phoneUses: counter }),
  minSeq: counter.positive().nullable(),
  maxSeq: counter.positive().nullable(),
  uncompressedSha256: hash,
  uncompressedByteLength: counter,
  compressedSha256: hash,
  compressedByteLength: counter,
  dataKey: text,
});
export type ArchiveManifest = z.infer<typeof ArchiveManifestSchema>;
export type ArchiveCodecError = "archive/integrity" | "archive/invalid" | "archive/too-large";
export type PreparedArchiveMonth = {
  readonly manifest: ArchiveManifest;
  readonly bytes: Uint8Array;
  readonly manifestBytes: Uint8Array;
  readonly manifestKey: string;
};
export type VerifiedArchiveMonth = {
  readonly manifest: ArchiveManifest;
  readonly records: readonly ArchiveRecord[];
};

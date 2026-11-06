import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

const isPublisherUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.href === value &&
      url.protocol === "https:" &&
      url.pathname === "/manifest" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
};
const trustSchema = z.strictObject({
  publisherUrl: z.string().refine(isPublisherUrl),
  channel: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/u),
  keyId: z.string().regex(/^[\w.-]{1,128}$/u),
  certificateSha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
const otaSchema = z.discriminatedUnion("isEnabled", [
  z.strictObject({ isEnabled: z.literal(false), trust: z.null() }),
  z.strictObject({ isEnabled: z.literal(true), trust: trustSchema }),
]);
const isPackageId = (value: string): boolean => {
  const segments = value.split(".");
  return segments.length >= 2 && segments.every((segment) => /^[a-zA-Z]\w*$/u.test(segment));
};

const versionPart = /^[\w.-]+$/u;
const isBunVersion = (value: string): boolean => {
  const parts = value.split("+");
  if (parts.length > 2) {
    return false;
  }
  const [version = "", build] = parts;
  if (build !== undefined && !versionPart.test(build)) {
    return false;
  }
  const separator = version.indexOf("-");
  const core = separator === -1 ? version : version.slice(0, separator);
  const prerelease = separator === -1 ? undefined : version.slice(separator + 1);
  return (
    /^\d+\.\d+\.\d+$/u.test(core) && (prerelease === undefined || versionPart.test(prerelease))
  );
};

const evidenceFields = {
  platform: z.enum(["android", "ios"]),
  packageId: z.string().refine(isPackageId),
  releaseTag: z.string().regex(/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u),
  nativeVersion: z.string(),
  versionCode: z.number().int().min(1).max(2_147_483_647),
  // Pinned Expo fingerprint defaults to SHA-1. This is supplied evidence, not a hash calculator.
  fingerprint: z.string().regex(/^[a-f0-9]{40}$/u),
  bunVersion: z.string().refine(isBunVersion),
  ota: otaSchema,
};
const isReleaseCoherent = (input: {
  readonly releaseTag: string;
  readonly nativeVersion: string;
}): boolean => input.releaseTag === `v${input.nativeVersion}`;
const recordSchema = z
  .strictObject({ ...evidenceFields, format: z.literal(1), platform: z.literal("android") })
  .refine(isReleaseCoherent);
const evidenceSchema = z.strictObject(evidenceFields).refine(isReleaseCoherent);

export type NativeRuntimeRecord = z.infer<typeof recordSchema>;
export type CandidateRuntimeEvidence = z.infer<typeof evidenceSchema>;
export type NativeRuntimeError =
  | "build-input-mismatch"
  | "candidate-invalid"
  | "fingerprint-mismatch"
  | "ota-disabled"
  | "record-invalid"
  | "toolchain-mismatch"
  | "trust-mismatch";

/** Validate the APK build record; disabled APKs deliberately carry no invented trust identity. */
export const parseNativeRuntimeRecord = (
  input: unknown,
): Result<NativeRuntimeRecord, "record-invalid"> => {
  const parsed = recordSchema.safeParse(input);
  return parsed.success ? ok(parsed.data) : err("record-invalid");
};

const isSameBuild = (record: NativeRuntimeRecord, candidate: CandidateRuntimeEvidence): boolean =>
  record.platform === candidate.platform &&
  record.packageId === candidate.packageId &&
  record.releaseTag === candidate.releaseTag &&
  record.nativeVersion === candidate.nativeVersion &&
  record.versionCode === candidate.versionCode;

const isSameTrust = (
  record: z.infer<typeof trustSchema>,
  candidate: z.infer<typeof trustSchema>,
): boolean =>
  record.publisherUrl === candidate.publisherUrl &&
  record.channel === candidate.channel &&
  record.keyId === candidate.keyId &&
  record.certificateSha256 === candidate.certificateSha256;

const compareEvidence = (
  record: NativeRuntimeRecord,
  candidate: CandidateRuntimeEvidence,
): Result<NativeRuntimeRecord, NativeRuntimeError> => {
  if (!record.ota.isEnabled || !candidate.ota.isEnabled) {
    return err("ota-disabled");
  }
  if (!isSameBuild(record, candidate)) {
    return err("build-input-mismatch");
  }
  if (record.bunVersion !== candidate.bunVersion) {
    return err("toolchain-mismatch");
  }
  if (!isSameTrust(record.ota.trust, candidate.ota.trust)) {
    return err("trust-mismatch");
  }
  if (record.fingerprint !== candidate.fingerprint) {
    return err("fingerprint-mismatch");
  }
  return ok(record);
};

/** Compare explicit APK/candidate evidence. The caller must collect the real default Expo fingerprint. */
export const verifyNativeRuntime = (
  record: unknown,
  candidate: unknown,
): Result<NativeRuntimeRecord, NativeRuntimeError> => {
  const native = parseNativeRuntimeRecord(record);
  if (!native.ok) {
    return native;
  }
  const current = evidenceSchema.safeParse(candidate);
  return current.success ? compareEvidence(native.value, current.data) : err("candidate-invalid");
};

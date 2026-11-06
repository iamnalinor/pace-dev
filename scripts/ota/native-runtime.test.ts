import { expect, test } from "bun:test";

import {
  type CandidateRuntimeEvidence,
  type NativeRuntimeRecord,
  parseNativeRuntimeRecord,
  verifyNativeRuntime,
} from "./native-runtime.ts";

const evidence = {
  platform: "android",
  packageId: "dev.pace.app",
  releaseTag: "v1.2.3",
  nativeVersion: "1.2.3",
  versionCode: 10_203_000,
  fingerprint: "a".repeat(40),
  bunVersion: "1.4.2",
  ota: {
    isEnabled: true,
    trust: {
      publisherUrl: "https://updates.example/manifest",
      channel: "production",
      keyId: "release-key",
      certificateSha256: "b".repeat(64),
    },
  },
} satisfies CandidateRuntimeEvidence;
const record = { format: 1, ...evidence } satisfies NativeRuntimeRecord;

test("accepts a recorded APK and an explicitly supplied matching JS-candidate fingerprint", () => {
  const copied = structuredClone(record);
  expect(parseNativeRuntimeRecord(copied)).toEqual({
    ok: true,
    value: record,
  });
  expect(verifyNativeRuntime(record, evidence)).toEqual({ ok: true, value: record });
});

test("preserves native release inputs instead of deriving versions from the candidate Git revision", () => {
  const result = verifyNativeRuntime(record, evidence);
  expect(result).toMatchObject({
    ok: true,
    value: { releaseTag: "v1.2.3", nativeVersion: "1.2.3", versionCode: 10_203_000 },
  });
  expect(
    verifyNativeRuntime(record, { ...evidence, releaseTag: "v1.2.4", nativeVersion: "1.2.4" }),
  ).toEqual({ ok: false, error: "build-input-mismatch" });
});

test("refuses changed native fingerprints without inventing a source-file allowlist", () => {
  expect(verifyNativeRuntime(record, { ...evidence, fingerprint: "c".repeat(40) })).toEqual({
    ok: false,
    error: "fingerprint-mismatch",
  });
});

test.each([
  { publisherUrl: "https://other.example/manifest" },
  { channel: "preview" },
  { keyId: "other-key" },
  { certificateSha256: "c".repeat(64) },
])("refuses changed build trust: %j", (change) => {
  const candidate = {
    ...evidence,
    ota: { isEnabled: true, trust: { ...evidence.ota.trust, ...change } },
  };
  expect(verifyNativeRuntime(record, candidate)).toEqual({ ok: false, error: "trust-mismatch" });
});

test("refuses toolchain, platform, package and native version-code mismatches", () => {
  expect(verifyNativeRuntime(record, { ...evidence, bunVersion: "1.4.3" })).toEqual({
    ok: false,
    error: "toolchain-mismatch",
  });
  for (const change of [
    { platform: "ios" },
    { packageId: "dev.other.app" },
    { versionCode: 10_203_001 },
  ]) {
    expect(verifyNativeRuntime(record, { ...evidence, ...change })).toEqual({
      ok: false,
      error: "build-input-mismatch",
    });
  }
});

test("represents disabled APKs without fictitious trust, but refuses publication to them", () => {
  const disabled = {
    ...record,
    ota: { isEnabled: false, trust: null },
  } satisfies NativeRuntimeRecord;
  expect(parseNativeRuntimeRecord(disabled)).toEqual({ ok: true, value: disabled });
  expect(verifyNativeRuntime(disabled, evidence)).toEqual({ ok: false, error: "ota-disabled" });
  expect(
    verifyNativeRuntime(record, { ...evidence, ota: { isEnabled: false, trust: null } }),
  ).toEqual({ ok: false, error: "ota-disabled" });
});

test.each([
  null,
  {},
  { ...record, format: 2 },
  { ...record, platform: "ios" },
  { ...record, fingerprint: "supplied-not-an-expo-hash" },
  { ...record, bunVersion: "" },
  { ...record, releaseTag: "" },
  { ...record, nativeVersion: "1.2.4" },
  { ...record, versionCode: 0 },
  { ...record, ota: { isEnabled: true, trust: null } },
  { ...record, ota: { isEnabled: false, trust: evidence.ota.trust } },
])("refuses missing or malformed APK evidence: %j", (input) => {
  expect(parseNativeRuntimeRecord(input)).toEqual({ ok: false, error: "record-invalid" });
});

test.each([
  null,
  {},
  { ...evidence, fingerprint: "" },
  { ...evidence, releaseTag: "v1.2.3", nativeVersion: "1.2.3-dev.1" },
  {
    ...evidence,
    ota: {
      isEnabled: true,
      trust: { ...evidence.ota.trust, publisherUrl: "http://updates.example/manifest" },
    },
  },
  {
    ...evidence,
    ota: {
      isEnabled: true,
      trust: {
        ...evidence.ota.trust,
        publisherUrl: "https://user:password@updates.example/manifest",
      },
    },
  },
  {
    ...evidence,
    ota: { isEnabled: true, trust: { ...evidence.ota.trust, certificateSha256: "not-a-digest" } },
  },
])("refuses missing or malformed candidate evidence: %j", (input) => {
  expect(verifyNativeRuntime(record, input)).toEqual({ ok: false, error: "candidate-invalid" });
});

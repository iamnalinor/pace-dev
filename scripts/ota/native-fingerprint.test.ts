import { expect, test } from "bun:test";

import { validateNativeFingerprint } from "./native-fingerprint.ts";

const hash = "a".repeat(40);
const nativeSources = [
  { type: "contents", id: "expoConfig", hash },
  { type: "dir", filePath: "modules/pace-native/android", hash },
  { type: "contents", id: "expoAutolinkingConfig:android", hash },
  { type: "contents", id: "rncoreAutolinkingConfig:android", hash },
];

test("accepts the full default native source evidence without reducing the source set", () => {
  expect(validateNativeFingerprint({ hash, sources: nativeSources }, false)).toEqual({
    ok: true,
    value: hash,
  });
});

test.each(nativeSources.map((source) => source.id ?? source.filePath))(
  "rejects a successful-looking fingerprint missing %s",
  (missing) => {
    const sources = nativeSources.filter((source) => (source.id ?? source.filePath) !== missing);
    expect(validateNativeFingerprint({ hash, sources }, false)).toEqual({
      ok: false,
      error: "fingerprint-incomplete",
    });
  },
);

test("requires an actual native source hash, not just its name", () => {
  expect(
    validateNativeFingerprint(
      { hash, sources: nativeSources.map((source) => ({ ...source, hash: null })) },
      false,
    ),
  ).toEqual({ ok: false, error: "fingerprint-incomplete" });
});

test("requires public certificate contents when recording an OTA-enabled APK", () => {
  expect(validateNativeFingerprint({ hash, sources: nativeSources }, true)).toEqual({
    ok: false,
    error: "fingerprint-incomplete",
  });
  const sources = [
    ...nativeSources,
    { type: "file", filePath: "ota/publisher-certificate.pem", hash },
  ];
  expect(validateNativeFingerprint({ hash, sources }, true)).toEqual({ ok: true, value: hash });
});

test("rejects malformed tool output", () => {
  expect(validateNativeFingerprint({ hash: "looks-good", sources: [] }, false)).toEqual({
    ok: false,
    error: "fingerprint-unavailable",
  });
});

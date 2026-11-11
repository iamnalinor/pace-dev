import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { parseExportMetadata } from "@pace/updates/export-metadata";
import { createManifest, validateManifestBytes } from "@pace/updates/manifest";

import { expoAssetKey } from "./asset-key.ts";

const metadata = {
  version: 0,
  bundler: "metro",
  fileMetadata: {
    android: {
      bundle: "_expo/static/js/android/entry.hbc",
      assets: [
        { path: "assets/font-hash", ext: "ttf" },
        { path: "assets/image-hash", ext: "png" },
      ],
    },
  },
};
const options = {
  id: "12345678-1234-4234-8234-123456789abc",
  createdAt: "2026-11-05T12:00:00.000Z",
  runtimeVersion: "native-fingerprint",
  assetOrigin: "https://updates.example",
  extra: { expoClient: { extra: { apiUrl: "https://account.example" } } },
};
const file = (path: string, text: string) => ({
  path,
  key: expoAssetKey(text),
  hash: createHash("sha256").update(text).digest("base64url"),
  size: text.length,
});
const artifacts = () => {
  const plan = parseExportMetadata(metadata);
  if (!plan.ok) {
    throw new Error("fixture-plan");
  }
  return {
    plan: plan.value,
    files: [
      file(metadata.fileMetadata.android.bundle, "hermes"),
      file("assets/font-hash", "font"),
      file("assets/image-hash", "image"),
    ],
  };
};

describe("Android export manifest", () => {
  test("consumes pinned Expo export metadata and preserves content identities", () => {
    const result = createManifest(options, artifacts());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.manifest).toMatchObject({
      id: options.id,
      createdAt: options.createdAt,
      runtimeVersion: options.runtimeVersion,
      metadata: {},
      extra: options.extra,
      launchAsset: { contentType: "application/javascript", hash: file("", "hermes").hash },
      assets: [
        { contentType: "font/ttf", fileExtension: ".ttf" },
        { contentType: "image/png", fileExtension: ".png" },
      ],
    });
    expect(validateManifestBytes(result.value.bytes).ok).toBe(true);
    expect(new TextDecoder().decode(result.value.bytes)).toBe(
      JSON.stringify(result.value.manifest),
    );
  });
  test("is deterministic across input asset and extra-property order", () => {
    const input = artifacts();
    const first = createManifest(options, input);
    const second = createManifest(
      { ...options, extra: { expoClient: { extra: { apiUrl: "https://account.example" } } } },
      {
        ...input,
        files: input.files.toReversed(),
        plan: { ...input.plan, assets: input.plan.assets.toReversed() },
      },
    );
    expect(second).toEqual(first);
  });
  test.each([
    "../outside",
    "/etc/passwd",
    "assets/../secret",
    "assets//x",
    "assets/./x",
    "C:/secret",
    "assets\\secret",
    "assets/%2e%2e/x",
    "assets/name?x=1",
    "assets/name#fragment",
  ])("rejects unsafe export path %s", (bundle) => {
    expect(
      parseExportMetadata({
        ...metadata,
        fileMetadata: { android: { ...metadata.fileMetadata.android, bundle } },
      }).ok,
    ).toBe(false);
  });
  test.each([
    null,
    {},
    { ...metadata, version: 1 },
    { ...metadata, bundler: "other" },
    { ...metadata, fileMetadata: {} },
    { ...metadata, fileMetadata: { android: { bundle: "entry.hbc" } } },
  ])("rejects incomplete export metadata %#", (input) => {
    expect(parseExportMetadata(input).ok).toBe(false);
  });
  test("rejects duplicate export paths and unsupported MIME extensions", () => {
    const android = metadata.fileMetadata.android;
    expect(
      parseExportMetadata({
        ...metadata,
        fileMetadata: { android: { ...android, assets: [android.assets[0], android.assets[0]] } },
      }).ok,
    ).toBe(false);
    expect(
      parseExportMetadata({
        ...metadata,
        fileMetadata: {
          android: { ...android, assets: [{ path: "assets/x", ext: "constructor" }] },
        },
      }).ok,
    ).toBe(false);
  });
  test("requires exact artifact completeness and valid cryptographic identities", () => {
    const input = artifacts();
    expect(createManifest(options, { ...input, files: input.files.slice(1) }).ok).toBe(false);
    expect(
      createManifest(options, { ...input, files: [...input.files, file("assets/extra", "x")] }).ok,
    ).toBe(false);
    expect(
      createManifest(options, {
        ...input,
        files: input.files.map((entry) => ({ ...entry, hash: "wrong" })),
      }).ok,
    ).toBe(false);
  });
  test.each([
    { ...options, id: "not-a-uuid" },
    { ...options, createdAt: "yesterday" },
    { ...options, createdAt: "2026-11-05" },
    { ...options, runtimeVersion: " " },
    { ...options, assetOrigin: "http://updates.example" },
    { ...options, assetOrigin: "https://user:secret@updates.example" },
    { ...options, assetOrigin: "https://updates.example/path" },
  ])("rejects invalid deterministic manifest inputs %#", (input) => {
    expect(createManifest(input, artifacts()).ok).toBe(false);
  });
  test("rejects malformed manifest bytes", () => {
    expect(validateManifestBytes(new TextEncoder().encode("not-json")).ok).toBe(false);
    expect(validateManifestBytes(new TextEncoder().encode("{}")).ok).toBe(false);
  });
});

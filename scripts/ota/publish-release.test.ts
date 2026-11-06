import { describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync } from "node:crypto";

import type { StageReleaseInput } from "@pace/updates/release-validation";
import type { StagedRelease } from "@pace/updates/store-types";

import { parseExportMetadata } from "@pace/updates/export-metadata";
import { createManifest } from "@pace/updates/manifest";
import { promoteRelease } from "@pace/updates/publish-promote";
import { stageRelease } from "@pace/updates/publish-stage";
import { channelKey, releaseKey } from "@pace/updates/release-codec";
import { selectRelease } from "@pace/updates/release-read";

import { expoAssetKey } from "./asset-key.ts";
import { signManifest } from "./signing.ts";
import { MemoryReleaseStore } from "./store-memory.fixtures.ts";

const assetOrigin = "https://updates.example";
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = key.privateKey.export({ type: "pkcs8", format: "pem" });
const fixture = (
  id = "12345678-1234-4234-8234-123456789abc",
  createdAt = "2026-11-05T12:00:00.000Z",
): StageReleaseInput => {
  const plan = parseExportMetadata({
    version: 0,
    bundler: "metro",
    fileMetadata: {
      android: { bundle: "entry.hbc", assets: [{ path: "assets/font", ext: "ttf" }] },
    },
  });
  if (!plan.ok) {
    throw new Error("fixture-plan");
  }
  const files = ["entry.hbc", "assets/font"].map((path) => {
    const bytes = new TextEncoder().encode(path);
    return {
      path,
      bytes,
      size: bytes.length,
      key: expoAssetKey(bytes),
      hash: createHash("sha256").update(bytes).digest("base64url"),
    };
  });
  const artifacts = { plan: plan.value, files };
  const manifest = createManifest(
    { id, createdAt, runtimeVersion: "runtime", assetOrigin },
    artifacts,
  );
  if (!manifest.ok) {
    throw new Error("fixture-manifest");
  }
  const signed = signManifest(manifest.value.bytes, { privateKeyPem, keyId: "root" });
  if (!signed.ok) {
    throw new Error("fixture-signing");
  }
  return { artifacts, signed: signed.value, assetOrigin };
};
const staged = async (store: MemoryReleaseStore, input = fixture()): Promise<StagedRelease> => {
  const result = await stageRelease(input, store.port);
  if (!result.ok) {
    throw new Error(`fixture-stage:${result.error}`);
  }
  return result.value;
};

describe("immutable OTA release pipeline", () => {
  test("stages complete bytes, verifies readback, and changes channel only with explicit CAS", async () => {
    const store = new MemoryReleaseStore();
    const input = fixture();
    const release = await staged(store, input);
    expect(store.calls.some((call) => call.startsWith("cas:"))).toBe(false);
    expect(store.objects.size).toBe(4);
    const promoted = await promoteRelease(
      { release, channel: "preview", expectedEtag: null },
      store.port,
    );
    expect(promoted.ok).toBe(true);
    const selected = await selectRelease(
      { runtimeVersion: "runtime", channel: "preview" },
      store.port,
    );
    expect(selected).toMatchObject({
      ok: true,
      value: { release: release.record, signed: input.signed },
    });
    expect(store.calls.at(-1)).toBe(`read:manifests/${release.record.manifestHash}.json`);
    expect(
      await selectRelease({ runtimeVersion: "other", channel: "preview" }, store.port),
    ).toEqual({ ok: true, value: null });
    expect(
      await selectRelease({ runtimeVersion: "runtime", channel: "production" }, store.port),
    ).toEqual({ ok: true, value: null });
  });
  test("same-byte stage retries are idempotent and immutable collisions never overwrite", async () => {
    const store = new MemoryReleaseStore();
    const input = fixture();
    const first = await staged(store, input);
    const etags = store.objects
      .values()
      .map(({ etag }) => etag)
      .toArray();
    expect(await stageRelease(input, store.port)).toEqual({ ok: true, value: first });
    expect(
      store.objects
        .values()
        .map(({ etag }) => etag)
        .toArray(),
    ).toEqual(etags);
    const asset = first.record.assets[0];
    if (asset === undefined) {
      throw new Error("fixture-asset");
    }
    store.write(asset.objectKey, new Uint8Array([255]));
    expect(await stageRelease(input, store.port)).toEqual({
      ok: false,
      error: "immutable-collision",
    });
  });
  test("rejects modified bytes, missing files, wrong URLs and mismatched keys before any write", async () => {
    const input = fixture();
    const store = new MemoryReleaseStore();
    const changed = {
      ...input,
      artifacts: {
        ...input.artifacts,
        files: input.artifacts.files.map((file) => ({ ...file, bytes: new Uint8Array([1]) })),
      },
    };
    expect((await stageRelease(changed, store.port)).ok).toBe(false);
    expect(
      (await stageRelease({ ...input, artifacts: { ...input.artifacts, files: [] } }, store.port))
        .ok,
    ).toBe(false);
    expect(
      (await stageRelease({ ...input, assetOrigin: "https://foreign.example" }, store.port)).ok,
    ).toBe(false);
    const wrongKeys = {
      ...input,
      artifacts: {
        ...input.artifacts,
        files: input.artifacts.files.map((file) => ({ ...file, key: "b".repeat(32) })),
      },
    };
    expect((await stageRelease(wrongKeys, store.port)).ok).toBe(false);
    expect(store.calls).toEqual([]);
  });
  test("failed staging and readback leave the previous channel unchanged", async () => {
    const store = new MemoryReleaseStore();
    const original = await staged(store);
    const first = await promoteRelease(
      { release: original, channel: "production", expectedEtag: null },
      store.port,
    );
    if (!first.ok) {
      throw new Error("fixture-promotion");
    }
    const before = store.objects.get(channelKey("runtime", "production"));
    const next = fixture("87654321-1234-4234-8234-123456789abc", "2026-11-05T13:00:00.000Z");
    store.failures.add(`put:${releaseKey("runtime", "87654321-1234-4234-8234-123456789abc")}`);
    expect((await stageRelease(next, store.port)).ok).toBe(false);
    expect(store.objects.get(channelKey("runtime", "production"))).toEqual(before);
    store.failures.clear();
    store.corruptKey = original.record.assets[0]?.objectKey ?? null;
    expect(
      (
        await promoteRelease(
          { release: original, channel: "production", expectedEtag: first.value.etag },
          store.port,
        )
      ).ok,
    ).toBe(false);
    expect(store.objects.get(channelKey("runtime", "production"))).toEqual(before);
  });
  test("concurrent CAS fails without replacing another publisher's channel", async () => {
    const store = new MemoryReleaseStore();
    const release = await staged(store);
    store.beforeCas = () => {
      store.write(channelKey("runtime", "preview"), new TextEncoder().encode("concurrent-owner"));
    };
    expect(
      await promoteRelease({ release, channel: "preview", expectedEtag: null }, store.port),
    ).toEqual({ ok: false, error: "channel-conflict" });
    const stored = store.objects.get(channelKey("runtime", "preview"));
    expect(new TextDecoder().decode(stored?.bytes)).toBe("concurrent-owner");
  });
  test("older rollback pointers are rejected; old code repackaged under newer identity succeeds", async () => {
    const store = new MemoryReleaseStore();
    const old = await staged(store);
    const latest = await staged(
      store,
      fixture("87654321-1234-4234-8234-123456789abc", "2026-11-05T13:00:00.000Z"),
    );
    const promoted = await promoteRelease(
      { release: latest, channel: "production", expectedEtag: null },
      store.port,
    );
    if (!promoted.ok) {
      throw new Error("fixture-promotion");
    }
    expect(
      await promoteRelease(
        { release: old, channel: "production", expectedEtag: promoted.value.etag },
        store.port,
      ),
    ).toEqual({ ok: false, error: "rollback-repackage-required" });
    const repackaged = await staged(
      store,
      fixture("bbbbbbbb-1234-4234-8234-123456789abc", "2026-11-05T14:00:00.000Z"),
    );
    expect(
      (
        await promoteRelease(
          { release: repackaged, channel: "production", expectedEtag: promoted.value.etag },
          store.port,
        )
      ).ok,
    ).toBe(true);
  });
  test("uses immutable stored dates rather than caller-mutated staged metadata", async () => {
    const store = new MemoryReleaseStore();
    const old = await staged(store);
    const latest = await staged(
      store,
      fixture("87654321-1234-4234-8234-123456789abc", "2026-11-05T13:00:00.000Z"),
    );
    const promoted = await promoteRelease(
      { release: latest, channel: "preview", expectedEtag: null },
      store.port,
    );
    if (!promoted.ok) {
      throw new Error("fixture-promotion");
    }
    const altered = { ...old, record: { ...old.record, createdAt: "2027-01-01T00:00:00.000Z" } };
    expect(
      await promoteRelease(
        { release: altered, channel: "preview", expectedEtag: promoted.value.etag },
        store.port,
      ),
    ).toEqual({ ok: false, error: "rollback-repackage-required" });
  });
  test("storage faults and malformed pointers never become no update", async () => {
    const store = new MemoryReleaseStore();
    const pointerKey = channelKey("runtime", "preview");
    store.failures.add(`read:${pointerKey}`);
    expect(
      await selectRelease({ runtimeVersion: "runtime", channel: "preview" }, store.port),
    ).toEqual({ ok: false, error: "store-failed" });
    store.failures.clear();
    store.write(pointerKey, new TextEncoder().encode("{}"));
    expect(
      (await selectRelease({ runtimeVersion: "runtime", channel: "preview" }, store.port)).ok,
    ).toBe(false);
  });
});

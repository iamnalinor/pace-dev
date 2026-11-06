import { createHash } from "node:crypto";

import type { ReleaseStore } from "../src/shared/store-types.ts";
import type { SignedManifest } from "../src/shared/types.ts";

import { createManifest } from "../src/shared/manifest.ts";
import { promoteRelease } from "../src/shared/publish-promote.ts";
import { stageRelease } from "../src/shared/publish-stage.ts";

const bundle = new TextEncoder().encode("test executable bundle");

const signFixture = async (body: Uint8Array): Promise<SignedManifest> => {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    false,
    ["sign", "verify"],
  );
  const raw = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keys.privateKey,
    Uint8Array.from(body).buffer,
  );
  const signature = btoa(String.fromCodePoint(...new Uint8Array(raw)));
  return {
    body,
    signature,
    signatureHeader: `sig="${signature}", keyid="root", alg="rsa-v1_5-sha256"`,
  };
};

export const publishFixture = async (
  store: ReleaseStore,
): Promise<{
  readonly body: Uint8Array;
  readonly signatureHeader: string;
  readonly assetKey: string;
}> => {
  const artifact = {
    path: "entry.hbc",
    bytes: bundle,
    size: bundle.length,
    key: "2155d609025274fb58e7553008732a72",
    hash: createHash("sha256").update(bundle).digest("base64url"),
  };
  const manifest = createManifest(
    {
      id: "12345678-1234-4234-8234-123456789abc",
      createdAt: "2026-11-05T12:00:00.000Z",
      runtimeVersion: "published-runtime",
      assetOrigin: "https://updates.test",
    },
    { plan: { bundle: "entry.hbc", assets: [] }, files: [artifact] },
  );
  if (!manifest.ok) {
    throw new Error("fixture manifest failed");
  }
  const signed = await signFixture(manifest.value.bytes);
  const staged = await stageRelease(
    {
      artifacts: { plan: { bundle: "entry.hbc", assets: [] }, files: [artifact] },
      signed,
      assetOrigin: "https://updates.test",
    },
    store,
  );
  if (!staged.ok) {
    throw new Error(`fixture staging failed: ${staged.error}`);
  }
  const promoted = await promoteRelease(
    { release: staged.value, channel: "preview", expectedEtag: null },
    store,
  );
  if (!promoted.ok) {
    throw new Error(`fixture promotion failed: ${promoted.error}`);
  }
  return {
    body: signed.body,
    signatureHeader: signed.signatureHeader,
    assetKey: `assets/${artifact.hash}/${artifact.key}.bundle`,
  };
};

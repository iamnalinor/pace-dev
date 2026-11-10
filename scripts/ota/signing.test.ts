import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";

import { parseExportMetadata } from "@pace/updates/export-metadata";
import { createManifest } from "@pace/updates/manifest";

import { signManifest } from "./signing.ts";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = keys.privateKey.export({ type: "pkcs8", format: "pem" });
const body = (): Uint8Array => {
  const plan = parseExportMetadata({
    version: 0,
    bundler: "metro",
    fileMetadata: { android: { bundle: "entry.hbc", assets: [] } },
  });
  if (!plan.ok) {
    throw new Error("fixture-plan");
  }
  const result = createManifest(
    {
      id: "12345678-1234-4234-8234-123456789abc",
      createdAt: "2026-11-05T12:00:00.000Z",
      runtimeVersion: "runtime",
      assetOrigin: "https://updates.example",
    },
    {
      plan: plan.value,
      files: [{ path: "entry.hbc", key: "a".repeat(32), hash: "a".repeat(43), size: 1 }],
    },
  );
  if (!result.ok) {
    throw new Error("fixture-manifest");
  }
  return result.value.bytes;
};
const isVerified = async (
  bytes: Uint8Array,
  signature: string,
  publicKey: Uint8Array,
): Promise<boolean> => {
  const imported = await crypto.subtle.importKey(
    "spki",
    publicKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    imported,
    Buffer.from(signature, "base64"),
    bytes,
  );
};

describe("Expo RSA-SHA256 exact-byte signing", () => {
  test("independent WebCrypto verifies the exact returned bytes and structured header", async () => {
    const bytes = body();
    const signed = signManifest(bytes, { privateKeyPem, keyId: "publisher-root" });
    expect(signed.ok).toBe(true);
    if (!signed.ok) {
      return;
    }
    expect(signed.value.body).toEqual(bytes);
    expect(signed.value.signatureHeader).toBe(
      `sig="${signed.value.signature}", keyid="publisher-root", alg="rsa-v1_5-sha256"`,
    );
    expect(
      await isVerified(
        signed.value.body,
        signed.value.signature,
        keys.publicKey.export({ type: "spki", format: "der" }),
      ),
    ).toBe(true);
    expect(JSON.stringify(signed)).not.toContain("PRIVATE KEY");
  });
  test("independent verifier rejects tampering and a different key", async () => {
    const signed = signManifest(body(), { privateKeyPem, keyId: "root" });
    if (!signed.ok) {
      throw new Error("fixture-signature");
    }
    const changed = new Uint8Array([...signed.value.body, 32]);
    expect(
      await isVerified(
        changed,
        signed.value.signature,
        keys.publicKey.export({ type: "spki", format: "der" }),
      ),
    ).toBe(false);
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(
      await isVerified(
        signed.value.body,
        signed.value.signature,
        other.publicKey.export({ type: "spki", format: "der" }),
      ),
    ).toBe(false);
  });
  test("does not alias caller-owned bytes", () => {
    const bytes = body();
    const signed = signManifest(bytes, { privateKeyPem, keyId: "root" });
    if (!signed.ok) {
      throw new Error("fixture-signature");
    }
    bytes.fill(0);
    expect(signed.value.body[0]).not.toBe(0);
  });
  test("rejects unsigned, malformed, weak or non-RSA key material without leaking it", () => {
    expect(signManifest(body(), { privateKeyPem: "SECRET_BROKEN_KEY", keyId: "root" })).toEqual({
      ok: false,
      error: "signing-failed",
    });
    expect(signManifest(body(), { privateKeyPem, keyId: 'injected"header' }).ok).toBe(false);
    expect(signManifest(new Uint8Array(), { privateKeyPem, keyId: "root" }).ok).toBe(false);
    const weak = generateKeyPairSync("rsa", { modulusLength: 1024 });
    expect(
      signManifest(body(), {
        privateKeyPem: weak.privateKey.export({ type: "pkcs8", format: "pem" }),
        keyId: "root",
      }).ok,
    ).toBe(false);
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    expect(
      signManifest(body(), {
        privateKeyPem: ec.privateKey.export({ type: "pkcs8", format: "pem" }),
        keyId: "root",
      }).ok,
    ).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";

import { parseExportMetadata } from "@pace/updates/export-metadata";
import { createManifest } from "@pace/updates/manifest";
import { manifestResponse } from "@pace/updates/protocol";

import { signManifest } from "./signing.ts";

const request = {
  protocolVersion: "1",
  platform: "android",
  runtimeVersion: "runtime",
  accept: "application/expo+json,multipart/mixed",
};
const signed = () => {
  const plan = parseExportMetadata({
    version: 0,
    bundler: "metro",
    fileMetadata: { android: { bundle: "entry.hbc", assets: [] } },
  });
  if (!plan.ok) {
    throw new Error("fixture-plan");
  }
  const manifest = createManifest(
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
  if (!manifest.ok) {
    throw new Error("fixture-manifest");
  }
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const result = signManifest(manifest.value.bytes, {
    keyId: "root",
    privateKeyPem: key.privateKey.export({ type: "pkcs8", format: "pem" }),
  });
  if (!result.ok) {
    throw new Error("fixture-signature");
  }
  return { ...result.value, publicKey: key.publicKey.export({ type: "spki", format: "der" }) };
};

describe("Expo v1 manifest response bytes", () => {
  test("serves signed exact JSON bytes and required protocol headers", () => {
    const artifact = signed();
    const result = manifestResponse(artifact, request);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe(200);
    expect(result.value.body).toEqual(artifact.body);
    expect(result.value.headers).toMatchObject({
      "expo-protocol-version": "1",
      "expo-sfv-version": "0",
      "content-type": "application/expo+json",
      "expo-signature": artifact.signatureHeader,
      "cache-control": "private, no-store",
    });
  });
  test("supports multipart without altering signed manifest part bytes", async () => {
    const artifact = signed();
    const result = manifestResponse(artifact, { ...request, accept: "multipart/mixed" });
    if (!result.ok) {
      throw new Error("fixture-response");
    }
    const boundary = result.value.headers["content-type"]?.split("boundary=", 2)[1];
    expect(boundary).toBeDefined();
    const prefix = new TextEncoder().encode(
      `--${boundary}\r\ncontent-disposition: form-data; name="manifest"; filename="manifest.json"\r\ncontent-type: application/json\r\nexpo-signature: ${artifact.signatureHeader}\r\n\r\n`,
    );
    const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
    expect(result.value.body.subarray(0, prefix.length)).toEqual(prefix);
    expect(result.value.body.subarray(-suffix.length)).toEqual(suffix);
    const part = result.value.body.subarray(prefix.length, -suffix.length);
    expect(part).toEqual(artifact.body);
    const publicKey = await crypto.subtle.importKey(
      "spki",
      artifact.publicKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const isValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      Buffer.from(artifact.signature, "base64"),
      part,
    );
    expect(isValid).toBe(true);
  });
  test("honors specific q=0 exclusions ahead of wildcard acceptance", () => {
    const result = manifestResponse(signed(), {
      ...request,
      accept: "application/expo+json;q=0,application/json;q=0,*/*;q=1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.headers["content-type"]).toContain("multipart/mixed");
  });
  test("returns protocol-correct bodyless no-update only when multipart is accepted", () => {
    const result = manifestResponse(null, request);
    expect(result).toEqual({
      ok: true,
      value: {
        status: 204,
        headers: {
          "expo-protocol-version": "1",
          "expo-sfv-version": "0",
          "cache-control": "private, no-store",
        },
        body: new Uint8Array(),
      },
    });
    expect(manifestResponse(null, { ...request, accept: "application/json" })).toEqual({
      ok: false,
      error: "unsupported-update-request",
    });
  });
  test.each([
    { ...request, platform: "ios" },
    { ...request, runtimeVersion: "other" },
    { ...request, protocolVersion: "0" },
    { ...request, accept: "text/html" },
    { ...request, accept: "application/expo+json;q=0,multipart/mixed;q=0" },
  ])("rejects incompatible runtime/platform/negotiation %#", (input) => {
    expect(manifestResponse(signed(), input).ok).toBe(false);
  });
});

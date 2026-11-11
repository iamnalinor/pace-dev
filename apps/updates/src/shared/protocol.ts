import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

import type { OtaError, SignedManifest } from "./types.ts";

import { validateManifestBytes } from "./manifest.ts";

type ResponseArtifact = {
  readonly status: 200 | 204;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
};
const requestSchema = z.strictObject({
  protocolVersion: z.literal("1"),
  platform: z.literal("android"),
  runtimeVersion: z.string().min(1),
  accept: z.string().min(1),
});
const HEADERS = {
  "expo-protocol-version": "1",
  "expo-sfv-version": "0",
  "cache-control": "private, no-store",
};
const REPRESENTATIONS = ["application/expo+json", "application/json", "multipart/mixed"] as const;
const parseQuality = (value: string): number => {
  const [integer, fraction, ...extra] = value.split(".");
  if (extra.length > 0 || !["0", "1"].includes(integer ?? "")) {
    return 0;
  }
  if (fraction === undefined) {
    return Number(integer);
  }
  if (fraction.length === 0 || fraction.length > 3 || /\D/u.test(fraction)) {
    return 0;
  }
  if (integer === "1" && /[^0]/u.test(fraction)) {
    return 0;
  }
  return Number(value);
};
const quality = (accept: string, representation: string): number => {
  const entries = accept.split(",");
  const specific = entries.filter(
    (entry) => entry.split(";", 1)[0]?.trim().toLowerCase() === representation,
  );
  const qualities = (specific.length > 0 ? specific : entries).map((entry) => {
    const [mime, ...parameters] = entry
      .trim()
      .toLowerCase()
      .split(";")
      .map((part) => part.trim());
    if (mime !== representation && mime !== "*/*") {
      return 0;
    }
    const q = parameters.find((parameter) => parameter.startsWith("q="))?.slice(2) ?? "1";
    return parseQuality(q);
  });
  return Math.max(0, ...qualities);
};
const representationOf = (accept: string): (typeof REPRESENTATIONS)[number] | null => {
  const choices = REPRESENTATIONS.map((type) => ({ type, quality: quality(accept, type) }));
  const [preferred] = choices
    .filter((choice) => choice.quality > 0)
    .toSorted((a, b) => b.quality - a.quality);
  return preferred?.type ?? null;
};
const combined = (parts: readonly Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};
const multipart = (artifact: SignedManifest): ResponseArtifact => {
  const boundary = "pace-update-manifest";
  const header = `--${boundary}\r\ncontent-disposition: form-data; name="manifest"; filename="manifest.json"\r\ncontent-type: application/json\r\nexpo-signature: ${artifact.signatureHeader}\r\n\r\n`;
  const body = combined([
    new TextEncoder().encode(header),
    artifact.body,
    new TextEncoder().encode(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    status: 200,
    headers: { ...HEADERS, "content-type": `multipart/mixed; boundary=${boundary}` },
    body,
  };
};
const isSafeSignature = (artifact: SignedManifest): boolean => {
  const header =
    /^sig="([A-Za-z0-9+/]+={0,2})", keyid="[\w.-]{1,128}", alg="rsa-v1_5-sha256"$/.exec(
      artifact.signatureHeader,
    );
  return header?.[1] === artifact.signature;
};
export const manifestResponse = (
  artifact: null | SignedManifest,
  input: unknown,
): Result<ResponseArtifact, OtaError> => {
  const request = requestSchema.safeParse(input);
  if (!request.success) {
    return err("unsupported-update-request");
  }
  const type = representationOf(request.data.accept);
  if (type === null) {
    return err("unsupported-update-request");
  }
  if (artifact === null) {
    return quality(request.data.accept, "multipart/mixed") > 0
      ? ok({ status: 204, headers: HEADERS, body: new Uint8Array() })
      : err("unsupported-update-request");
  }
  const manifest = validateManifestBytes(artifact.body);
  if (
    !manifest.ok ||
    manifest.value.runtimeVersion !== request.data.runtimeVersion ||
    !isSafeSignature(artifact)
  ) {
    return err("invalid-manifest");
  }
  if (type === "multipart/mixed") {
    return ok(multipart(artifact));
  }
  return ok({
    status: 200,
    headers: { ...HEADERS, "content-type": type, "expo-signature": artifact.signatureHeader },
    body: Uint8Array.from(artifact.body),
  });
};

import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

import type { ChannelPointer, PublicationError, ReleaseRecord } from "./store-types.ts";

import { isCanonicalHttpsOrigin } from "./manifest-schema.ts";

const hash = z.string().regex(/^[\w-]{43}$/);
const text = z
  .string()
  .min(1)
  .refine((value) => value === value.trim());
export const channelSchema = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/);
const date = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const asset = z.strictObject({
  objectKey: text,
  hash,
  key: z.string().regex(/^[a-f0-9]{32}$/),
  size: z.number().int().positive(),
  contentType: text,
});
export const releaseSchema = z.strictObject({
  format: z.literal(1),
  id: z.uuid(),
  runtimeVersion: text,
  createdAt: date,
  assetOrigin: z.string().refine(isCanonicalHttpsOrigin),
  manifestHash: hash,
  signature: text,
  signatureHeader: text,
  assets: z.array(asset).min(1),
});
export const pointerSchema = z.strictObject({
  format: z.literal(1),
  channel: channelSchema,
  runtimeVersion: text,
  releaseId: z.uuid(),
  releaseHash: hash,
});
export const channelKey = (runtime: string, channel: string): string =>
  `channels/${encodeURIComponent(runtime)}/${channel}.json`;
export const releaseKey = (runtime: string, id: string): string =>
  `releases/${encodeURIComponent(runtime)}/${id}.json`;
export const manifestKey = (hash: string): string => `manifests/${hash}.json`;
export const encodeRecord = (value: ChannelPointer | ReleaseRecord): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));
export const parseRecord = <T>(
  bytes: Uint8Array,
  schema: z.ZodType<T>,
): Result<T, PublicationError> => {
  try {
    const parsed = schema.safeParse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown,
    );
    return parsed.success ? ok(parsed.data) : err("invalid-release");
  } catch {
    return err("invalid-release");
  }
};
export const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer),
  );
  return btoa(String.fromCodePoint(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

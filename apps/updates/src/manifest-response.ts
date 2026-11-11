import { z } from "zod";

import { createReleaseStore } from "./r2-store.ts";
import { manifestResponse } from "./shared/protocol.ts";
import { channelSchema } from "./shared/release-codec.ts";
import { selectRelease } from "./shared/release-read.ts";

const runtimeSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value === value.trim());
const requestSchema = z.object({
  protocolVersion: z.literal("1"),
  platform: z.literal("android"),
  runtimeVersion: runtimeSchema,
  channel: channelSchema,
  accept: z.string().min(1).max(2048),
});
const failure = (status: 400 | 406 | 503): Response =>
  Response.json(
    { error: status === 503 ? "updates/unavailable" : "updates/unsupported-request" },
    { status, headers: { "cache-control": "no-store" } },
  );

export const serveManifest = async (request: Request, bucket: R2Bucket): Promise<Response> => {
  const parsed = requestSchema.safeParse({
    protocolVersion: request.headers.get("expo-protocol-version"),
    platform: request.headers.get("expo-platform"),
    runtimeVersion: request.headers.get("expo-runtime-version"),
    channel: request.headers.get("expo-channel-name"),
    accept: request.headers.get("accept"),
  });
  if (!parsed.success) {
    return failure(400);
  }
  const { channel, ...protocol } = parsed.data;
  const selected = await selectRelease(
    { runtimeVersion: protocol.runtimeVersion, channel },
    createReleaseStore(bucket),
  );
  if (!selected.ok) {
    return failure(503);
  }
  const response = manifestResponse(selected.value?.signed ?? null, protocol);
  if (!response.ok) {
    return failure(response.error === "unsupported-update-request" ? 406 : 503);
  }
  const body = response.value.status === 204 ? null : Uint8Array.from(response.value.body).buffer;
  return new Response(body, { status: response.value.status, headers: response.value.headers });
};

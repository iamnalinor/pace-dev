import { z } from "zod";

import { isSafeExportPath } from "./export-metadata.ts";

export const jsonSchema = z.json();
export type JsonValue = z.output<typeof jsonSchema>;
const nonblank = z
  .string()
  .min(1)
  .refine((value) => value === value.trim());
const sha256 = z.string().regex(/^[\w-]{43}$/);
const md5 = z.string().regex(/^[a-f0-9]{32}$/);
const uuid = z.uuid();
const pathSchema = z.string().refine(isSafeExportPath);
const extension = z.string().regex(/^[a-z0-9]+$/);
const fileExtension = z.string().regex(/^\.[a-z0-9]+$/);
const size = z.number().int().positive();
const extras = z.record(z.string(), jsonSchema);
const metadata = z.record(z.string(), z.string());
export const isCanonicalHttpsOrigin = (input: string): boolean => {
  try {
    const url = new URL(input);
    return url.protocol === "https:" && url.origin === input;
  } catch {
    return false;
  }
};
const date = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const origin = z.string().refine(isCanonicalHttpsOrigin);
const assetUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === ""
  );
});
const assetDescription = z.object({ path: pathSchema, ext: extension, contentType: nonblank });
const plan = z.object({ bundle: pathSchema, assets: z.array(assetDescription) });
export const optionsSchema = z.object({
  id: uuid,
  createdAt: date,
  runtimeVersion: nonblank,
  assetOrigin: origin,
  extra: extras.default({}),
});
export const artifactSchema = z.object({ path: pathSchema, key: md5, hash: sha256, size });
export const artifactsSchema = z.object({ plan, files: z.array(artifactSchema) });
const asset = z.strictObject({
  key: md5,
  hash: sha256,
  contentType: nonblank,
  url: assetUrl,
  fileExtension: fileExtension.optional(),
});
export const manifestSchema = z.strictObject({
  id: uuid,
  createdAt: date,
  runtimeVersion: nonblank,
  launchAsset: asset,
  assets: z.array(asset),
  metadata,
  extra: extras,
});
export type OtaManifest = z.output<typeof manifestSchema>;

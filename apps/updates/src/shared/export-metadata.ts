import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

import type { ExportAsset, ExportPlan, OtaError } from "./types.ts";

const MIMES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  xml: "application/xml",
  json: "application/json",
  js: "application/javascript",
  txt: "text/plain",
  html: "text/html",
  css: "text/css",
  pdf: "application/pdf",
  bin: "application/octet-stream",
  db: "application/octet-stream",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
};
export const isSafeExportPath = (path: string): boolean =>
  path.length <= 1024 &&
  /^[\w./-]+$/.test(path) &&
  path.split("/").every((segment) => !["", ".", ".."].includes(segment));
const pathSchema = z.string().refine(isSafeExportPath);
const extensionSchema = z.string().regex(/^[a-z0-9]+$/);
const assetSchema = z.object({ path: pathSchema, ext: extensionSchema });
const androidSchema = z.object({ bundle: pathSchema, assets: z.array(assetSchema).max(10_000) });
const fileMetadataSchema = z.object({ android: androidSchema });
const metadataSchema = z.object({
  version: z.literal(0),
  bundler: z.literal("metro"),
  fileMetadata: fileMetadataSchema,
});

export const contentTypeForExtension = (extension: string): null | string => {
  const contentType = MIMES[extension];
  return typeof contentType === "string" && Object.hasOwn(MIMES, extension) ? contentType : null;
};
const assetsWithMime = (
  assets: readonly { readonly path: string; readonly ext: string }[],
): Result<readonly ExportAsset[], OtaError> => {
  const result: ExportAsset[] = [];
  for (const asset of assets) {
    const contentType = contentTypeForExtension(asset.ext);
    if (contentType === null) {
      return err("unsupported-asset-type");
    }
    result.push({ ...asset, contentType });
  }
  return ok(result);
};
export const parseExportMetadata = (input: unknown): Result<ExportPlan, OtaError> => {
  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success) {
    return err("invalid-export-metadata");
  }
  const { bundle, assets } = parsed.data.fileMetadata.android;
  const paths = [bundle, ...assets.map((asset) => asset.path)];
  if (new Set(paths).size !== paths.length) {
    return err("invalid-export-metadata");
  }
  const complete = assetsWithMime(assets);
  return complete.ok ? ok({ bundle, assets: complete.value }) : complete;
};

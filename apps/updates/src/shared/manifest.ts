import type { z } from "zod";

import { err, ok, type Result } from "@pace/core";

import type { Artifact, ExportArtifacts, OtaError } from "./types.ts";

import { parseExportMetadata } from "./export-metadata.ts";
import {
  artifactsSchema,
  type JsonValue,
  manifestSchema,
  optionsSchema,
  type OtaManifest,
} from "./manifest-schema.ts";

const compareText = (left: string, right: string): number => {
  const order = left.localeCompare(right, "en");
  if (order !== 0 || left === right) {
    return order;
  }
  return left < right ? -1 : 1;
};
const sortedJson = (value: JsonValue): { readonly value: JsonValue } => {
  if (Array.isArray(value)) {
    return { value: value.map((entry) => sortedJson(entry).value) };
  }
  if (value === null || typeof value !== "object") {
    return { value };
  }
  const keys = Object.keys(value).toSorted(compareText);
  return {
    value: Object.fromEntries(keys.map((key) => [key, sortedJson(value[key] ?? null).value])),
  };
};
const hasCompleteArtifacts = (input: ExportArtifacts): boolean => {
  const expected = [input.plan.bundle, ...input.plan.assets.map(({ path }) => path)];
  const paths = input.files.map(({ path }) => path);
  return (
    expected.length === paths.length &&
    new Set(expected).size === expected.length &&
    new Set(paths).size === paths.length &&
    expected.every((path) => paths.includes(path)) &&
    new Set(input.files.map(({ key }) => key)).size === input.files.length
  );
};
const wireAsset = (
  file: Artifact,
  description: { readonly origin: string; readonly contentType: string; readonly ext?: string },
): OtaManifest["launchAsset"] => ({
  key: file.key,
  hash: file.hash,
  contentType: description.contentType,
  url: `${description.origin}/assets/${file.hash}/${file.key}.${description.ext ?? "bundle"}`,
  ...(description.ext !== undefined && { fileExtension: `.${description.ext}` }),
});
const buildManifest = (
  options: z.output<typeof optionsSchema>,
  artifacts: ExportArtifacts,
): Result<OtaManifest, OtaError> => {
  const launch = artifacts.files.find(({ path }) => path === artifacts.plan.bundle);
  if (launch === undefined) {
    return err("invalid-artifacts");
  }
  const assets: OtaManifest["assets"] = [];
  const descriptors = artifacts.plan.assets.toSorted((left, right) =>
    compareText(left.path, right.path),
  );
  for (const descriptor of descriptors) {
    const file = artifacts.files.find(({ path }) => path === descriptor.path);
    if (file === undefined) {
      return err("invalid-artifacts");
    }
    assets.push(
      wireAsset(file, {
        origin: options.assetOrigin,
        contentType: descriptor.contentType,
        ext: descriptor.ext,
      }),
    );
  }
  return ok({
    id: options.id,
    createdAt: options.createdAt,
    runtimeVersion: options.runtimeVersion,
    launchAsset: wireAsset(launch, {
      origin: options.assetOrigin,
      contentType: "application/javascript",
    }),
    assets,
    metadata: {},
    extra: options.extra,
  });
};
export const createManifest = (
  input: unknown,
  files: unknown,
): Result<{ readonly manifest: OtaManifest; readonly bytes: Uint8Array }, OtaError> => {
  const options = optionsSchema.safeParse(input);
  if (!options.success) {
    return err("invalid-manifest-input");
  }
  const parsed = artifactsSchema.safeParse(files);
  if (!parsed.success || !hasCompleteArtifacts(parsed.data)) {
    return err("invalid-artifacts");
  }
  const plan = parseExportMetadata({
    version: 0,
    bundler: "metro",
    fileMetadata: { android: parsed.data.plan },
  });
  if (!plan.ok) {
    return plan;
  }
  const built = buildManifest(options.data, { ...parsed.data, plan: plan.value });
  if (!built.ok) {
    return built;
  }
  const extra = sortedJson(built.value.extra).value;
  const manifest = manifestSchema.parse({ ...built.value, extra });
  return ok({ manifest, bytes: new TextEncoder().encode(JSON.stringify(manifest)) });
};
export const validateManifestBytes = (bytes: Uint8Array): Result<OtaManifest, OtaError> => {
  try {
    const parsed = manifestSchema.safeParse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown,
    );
    return parsed.success ? ok(parsed.data) : err("invalid-manifest");
  } catch {
    return err("invalid-manifest");
  }
};

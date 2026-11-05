import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { type FileHandle, open, realpath, stat } from "node:fs/promises";
import pathModule from "node:path";

import type { Artifact, ExportArtifacts, OtaError } from "@pace/updates/types";

import { err, ok, type Result } from "@pace/core";
import { isSafeExportPath, parseExportMetadata } from "@pace/updates/export-metadata";

import { expoAssetKey } from "./asset-key.ts";

const isContained = (root: string, candidate: string): boolean => {
  const child = pathModule.relative(root, candidate);
  return (
    child !== "" && child !== ".." && !child.startsWith("../") && !pathModule.isAbsolute(child)
  );
};
const readOpenedFile = async (
  file: FileHandle,
  expected: Stats,
): Promise<Result<Uint8Array, OtaError>> => {
  const opened = await file.stat();
  if (!opened.isFile() || opened.dev !== expected.dev || opened.ino !== expected.ino) {
    return err("unsafe-export-path");
  }
  const bytes = await file.readFile();
  return bytes.length <= 67_108_864 ? ok(Uint8Array.from(bytes)) : err("export-read-failed");
};
const readSafeFile = async (root: string, path: string): Promise<Result<Uint8Array, OtaError>> => {
  if (!isSafeExportPath(path)) {
    return err("unsafe-export-path");
  }
  const actual = await realpath(pathModule.resolve(root, path));
  if (!isContained(root, actual)) {
    return err("unsafe-export-path");
  }
  const expected = await stat(actual);
  if (!expected.isFile() || expected.size > 67_108_864) {
    return err("export-read-failed");
  }
  const file = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return await readOpenedFile(file, expected);
  } finally {
    await file.close();
  }
};
const readMetadata = async (root: string): Promise<Result<unknown, OtaError>> => {
  const bytes = await readSafeFile(root, "metadata.json");
  if (!bytes.ok) {
    return bytes;
  }
  try {
    return ok(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.value)) as unknown);
  } catch {
    return err("invalid-export-metadata");
  }
};
const readArtifacts = async (
  root: string,
  paths: readonly string[],
): Promise<Result<readonly Artifact[], OtaError>> => {
  const result: Artifact[] = [];
  for (const path of paths) {
    const read = await readSafeFile(root, path);
    if (!read.ok) {
      return read;
    }
    const bytes = read.value;
    result.push({
      path,
      bytes,
      size: bytes.length,
      key: expoAssetKey(bytes),
      hash: createHash("sha256").update(bytes).digest("base64url"),
    });
  }
  return ok(result);
};
export const readExport = async (directory: string): Promise<Result<ExportArtifacts, OtaError>> => {
  try {
    const root = await realpath(directory);
    const metadata = await readMetadata(root);
    if (!metadata.ok) {
      return metadata;
    }
    const plan = parseExportMetadata(metadata.value);
    if (!plan.ok) {
      return plan;
    }
    const files = await readArtifacts(root, [
      plan.value.bundle,
      ...plan.value.assets.map(({ path }) => path),
    ]);
    return files.ok ? ok({ plan: plan.value, files: files.value }) : files;
  } catch {
    return err("export-read-failed");
  }
};

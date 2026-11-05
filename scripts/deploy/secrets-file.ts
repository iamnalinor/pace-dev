import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import pathModule from "node:path";

import { err, type Result } from "@pace/core";

import type { PortError, PortResult } from "./ports.ts";

type SecretFileError = "secret-file-failed" | PortError;

const runWithFile = async <T>(
  directory: string,
  values: Readonly<Record<string, null | string>>,
  run: (path: string) => PortResult<T>,
): Promise<Result<T, SecretFileError>> => {
  try {
    const path = pathModule.join(directory, "secrets.json");
    await writeFile(path, JSON.stringify(values), { encoding: "utf8", mode: 0o600, flag: "wx" });
    return await run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

/** Secret values never enter argv or errors; the command only receives a private file path. */
export const withSecretFile = async <T>(
  values: Readonly<Record<string, null | string>>,
  run: (path: string) => PortResult<T>,
  temporaryRoot = tmpdir(),
): Promise<Result<T, SecretFileError>> => {
  try {
    const directory = await mkdtemp(pathModule.join(temporaryRoot, "pace-deploy-"));
    return await runWithFile(directory, values, run);
  } catch {
    return err("secret-file-failed");
  }
};

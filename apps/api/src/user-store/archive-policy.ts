import { checkpointCutoff, err, ok, type Result } from "@pace/core";

import type { ActorStorage } from "../shared/ports/actor-storage.ts";
import type { ArchiveIoError, ArchiveStore } from "../shared/ports/archive-store.ts";
import type { ArchiveOperation } from "./archive-repository.ts";
import type { ArchiveCodecError } from "./archive-types.ts";

import { archiveHash } from "./archive-bytes.ts";
import { verifyArchiveMonth } from "./archive-codec.ts";
import { archivePrefix } from "./archive-validation.ts";

export type ArchiveError =
  | "archive/not-found"
  | "archive/owner-required"
  | "archive/stale"
  | ArchiveCodecError
  | ArchiveIoError;
export type Options = {
  readonly storage: ActorStorage;
  readonly archive?: ArchiveStore;
  readonly owner: string | undefined;
  readonly sourceSchemaTag: string;
  readonly canWrite: () => boolean;
};
export type CaptureInput = {
  readonly month: string;
  readonly now: string;
  readonly timezone: string;
};

export const isEligible = (input: CaptureInput): boolean => {
  const cutoff = checkpointCutoff(input.now, input.timezone);
  if (!cutoff.ok || !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(input.month)) {
    return false;
  }
  const end = new Date(`${input.month}-01T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return end.getTime() <= Date.parse(cutoff.value);
};
export const isEqualBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

export const readArchiveObject = async (
  archive: ArchiveStore | undefined,
  key: string,
): Promise<Result<Uint8Array, ArchiveError>> => {
  if (archive === undefined) {
    return err("archive/unavailable");
  }
  const result = await archive.get(key);
  if (!result.ok) {
    return result;
  }
  return result.value === null ? err("archive/integrity") : ok(result.value);
};

export const validateStagedArchive = async (
  operation: ArchiveOperation,
): Promise<Result<void, ArchiveError>> => {
  const { prepared } = operation;
  if (
    (await archiveHash(prepared.manifestBytes)) !== operation.id ||
    prepared.manifestKey !== `${archivePrefix(prepared.manifest)}manifests/${operation.id}.json`
  ) {
    return err("archive/integrity");
  }
  const verified = await verifyArchiveMonth(prepared.manifest, prepared.bytes, prepared.manifest);
  return verified.ok ? ok(undefined) : verified;
};

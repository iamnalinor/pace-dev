import { err, ok, type Result } from "@pace/core";

import type {
  PublicationError,
  ReleaseRecord,
  ReleaseStore,
  StagedRelease,
} from "./store-types.ts";

import { encodeRecord, manifestKey, releaseKey, sha256 } from "./release-codec.ts";
import { matchingManifest, prepareAssets, type StageReleaseInput } from "./release-validation.ts";
import { writeObjects } from "./store-operations.ts";

const stage = async (
  input: StageReleaseInput,
  store: ReleaseStore,
): Promise<Result<StagedRelease, PublicationError>> => {
  const signed = { ...input.signed, body: Uint8Array.from(input.signed.body) };
  const manifest = matchingManifest({ ...input, signed });
  if (!manifest.ok) {
    return manifest;
  }
  const assets = await prepareAssets(input, manifest.value);
  if (!assets.ok) {
    return assets;
  }
  const manifestHash = await sha256(signed.body);
  const record: ReleaseRecord = {
    format: 1,
    id: manifest.value.id,
    runtimeVersion: manifest.value.runtimeVersion,
    createdAt: manifest.value.createdAt,
    assetOrigin: input.assetOrigin,
    manifestHash,
    signature: signed.signature,
    signatureHeader: signed.signatureHeader,
    assets: assets.value.assets,
  };
  const bytes = encodeRecord(record);
  const objects = [
    ...assets.value.objects,
    { key: manifestKey(manifestHash), bytes: signed.body },
    { key: releaseKey(record.runtimeVersion, record.id), bytes },
  ];
  const result = await writeObjects(objects, store);
  return result.ok ? ok({ record, recordHash: await sha256(bytes) }) : result;
};
/** Stage touches immutable keys only. Inputs are a captured private export/signing result. */
export const stageRelease = async (
  input: StageReleaseInput,
  store: ReleaseStore,
): Promise<Result<StagedRelease, PublicationError>> => {
  try {
    return await stage(input, store);
  } catch {
    return err("invalid-release");
  }
};

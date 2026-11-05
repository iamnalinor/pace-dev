import { err, ok, type Result } from "@pace/core";

import type { OtaManifest } from "./manifest-schema.ts";
import type { WriteObject } from "./store-operations.ts";
import type { PublicationError, ReleaseAsset } from "./store-types.ts";
import type { ExportArtifacts, SignedManifest } from "./types.ts";

import { createManifest, validateManifestBytes } from "./manifest.ts";
import { manifestResponse } from "./protocol.ts";
import { sha256 } from "./release-codec.ts";

export type StageReleaseInput = {
  readonly artifacts: ExportArtifacts;
  readonly signed: SignedManifest;
  readonly assetOrigin: string;
};
export type PreparedAssets = {
  readonly assets: readonly ReleaseAsset[];
  readonly objects: readonly WriteObject[];
};
export const matchingManifest = (
  input: StageReleaseInput,
): Result<OtaManifest, PublicationError> => {
  const parsed = validateManifestBytes(input.signed.body);
  if (!parsed.ok) {
    return err("invalid-release");
  }
  const value = parsed.value;
  const rebuilt = createManifest(
    {
      id: value.id,
      createdAt: value.createdAt,
      runtimeVersion: value.runtimeVersion,
      assetOrigin: input.assetOrigin,
      extra: value.extra,
    },
    input.artifacts,
  );
  if (!rebuilt.ok || JSON.stringify(rebuilt.value.manifest) !== JSON.stringify(value)) {
    return err("asset-mismatch");
  }
  const response = manifestResponse(input.signed, {
    protocolVersion: "1",
    platform: "android",
    runtimeVersion: value.runtimeVersion,
    accept: "application/expo+json",
  });
  return response.ok ? ok(value) : err("invalid-release");
};
const preparedAsset = async (
  file: ExportArtifacts["files"][number],
  asset: OtaManifest["launchAsset"],
): Promise<
  Result<{ readonly descriptor: ReleaseAsset; readonly object: WriteObject }, PublicationError>
> => {
  if (!(file.bytes instanceof Uint8Array)) {
    return err("asset-mismatch");
  }
  const bytes = Uint8Array.from(file.bytes);
  if (bytes.length !== file.size || (await sha256(bytes)) !== asset.hash) {
    return err("asset-mismatch");
  }
  const objectKey = new URL(asset.url).pathname.slice(1);
  return ok({
    descriptor: {
      objectKey,
      hash: asset.hash,
      key: asset.key,
      size: bytes.length,
      contentType: asset.contentType,
    },
    object: { key: objectKey, bytes },
  });
};
export const prepareAssets = async (
  input: StageReleaseInput,
  manifest: OtaManifest,
): Promise<Result<PreparedAssets, PublicationError>> => {
  const assets: ReleaseAsset[] = [];
  const objects: WriteObject[] = [];
  for (const asset of [manifest.launchAsset, ...manifest.assets]) {
    const file = input.artifacts.files.find((file) => file.key === asset.key);
    if (file === undefined) {
      return err("asset-mismatch");
    }
    const prepared = await preparedAsset(file, asset);
    if (!prepared.ok) {
      return prepared;
    }
    assets.push(prepared.value.descriptor);
    objects.push(prepared.value.object);
  }
  return ok({ assets, objects });
};

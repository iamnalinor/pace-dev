import { err, ok, type Result } from "@pace/core";

import type { OtaManifest } from "./manifest-schema.ts";
import type {
  ChannelPointer,
  PublicationError,
  ReleaseRecord,
  ReleaseStore,
} from "./store-types.ts";
import type { SignedManifest } from "./types.ts";

import { validateManifestBytes } from "./manifest.ts";
import { manifestResponse } from "./protocol.ts";
import {
  channelKey,
  channelSchema,
  manifestKey,
  parseRecord,
  pointerSchema,
  releaseKey,
  releaseSchema,
  sha256,
} from "./release-codec.ts";
import { callStore } from "./store-operations.ts";

export type SelectedRelease = {
  readonly release: ReleaseRecord;
  readonly signed: SignedManifest;
  readonly pointerEtag: string;
};
export const readChannel = async (
  request: { readonly runtimeVersion: string; readonly channel: string },
  store: ReleaseStore,
): Promise<
  Result<null | { readonly pointer: ChannelPointer; readonly etag: string }, PublicationError>
> => {
  if (!channelSchema.safeParse(request.channel).success || request.runtimeVersion.trim() === "") {
    return err("invalid-channel");
  }
  const response = await callStore(
    async () => await store.read(channelKey(request.runtimeVersion, request.channel)),
  );
  if (!response.ok) {
    return response;
  }
  if (response.value === null) {
    return ok(null);
  }
  const parsed = parseRecord(response.value.bytes, pointerSchema);
  if (!parsed.ok) {
    return parsed;
  }
  if (
    parsed.value.runtimeVersion !== request.runtimeVersion ||
    parsed.value.channel !== request.channel
  ) {
    return err("runtime-mismatch");
  }
  return ok({ pointer: parsed.value, etag: response.value.etag });
};
const isManifestRecordMatch = (manifest: OtaManifest, record: ReleaseRecord): boolean => {
  const assets = [manifest.launchAsset, ...manifest.assets];
  if (
    assets.length !== record.assets.length ||
    new Set(assets.map(({ key }) => key)).size !== assets.length
  ) {
    return false;
  }
  return assets.every((asset) => {
    const descriptor = record.assets.find(({ key }) => key === asset.key);
    const expectedUrl = `${record.assetOrigin}/assets/${asset.hash}/${asset.key}${asset.fileExtension ?? ".bundle"}`;
    return (
      descriptor?.hash === asset.hash &&
      descriptor.contentType === asset.contentType &&
      asset.url === expectedUrl &&
      descriptor.objectKey === new URL(expectedUrl).pathname.slice(1)
    );
  });
};
const readSigned = async (
  record: ReleaseRecord,
  store: ReleaseStore,
): Promise<Result<SignedManifest, PublicationError>> => {
  const response = await callStore(async () => await store.read(manifestKey(record.manifestHash)));
  if (!response.ok) {
    return response;
  }
  if (response.value === null || (await sha256(response.value.bytes)) !== record.manifestHash) {
    return err("readback-failed");
  }
  const signed = {
    body: response.value.bytes,
    signature: record.signature,
    signatureHeader: record.signatureHeader,
  };
  const manifest = validateManifestBytes(signed.body);
  if (
    !manifest.ok ||
    manifest.value.id !== record.id ||
    manifest.value.createdAt !== record.createdAt ||
    manifest.value.runtimeVersion !== record.runtimeVersion ||
    !isManifestRecordMatch(manifest.value, record)
  ) {
    return err("invalid-release");
  }
  const verified = manifestResponse(signed, {
    protocolVersion: "1",
    platform: "android",
    runtimeVersion: record.runtimeVersion,
    accept: "application/expo+json",
  });
  return verified.ok ? ok(signed) : err("invalid-release");
};
export const readRelease = async (
  reference: {
    readonly runtimeVersion: string;
    readonly releaseId: string;
    readonly releaseHash: string;
  },
  store: ReleaseStore,
): Promise<
  Result<{ readonly release: ReleaseRecord; readonly signed: SignedManifest }, PublicationError>
> => {
  const object = await callStore(
    async () => await store.read(releaseKey(reference.runtimeVersion, reference.releaseId)),
  );
  if (!object.ok) {
    return object;
  }
  if (object.value === null || (await sha256(object.value.bytes)) !== reference.releaseHash) {
    return err("readback-failed");
  }
  const record = parseRecord(object.value.bytes, releaseSchema);
  if (!record.ok) {
    return record;
  }
  if (
    record.value.runtimeVersion !== reference.runtimeVersion ||
    record.value.id !== reference.releaseId
  ) {
    return err("runtime-mismatch");
  }
  const signed = await readSigned(record.value, store);
  return signed.ok ? ok({ release: record.value, signed: signed.value }) : signed;
};
/** Only an absent channel means no update. Corruption and storage errors stay explicit. */
export const selectRelease = async (
  request: { readonly runtimeVersion: string; readonly channel: string },
  store: ReleaseStore,
): Promise<Result<null | SelectedRelease, PublicationError>> => {
  const channel = await readChannel(request, store);
  if (!channel.ok) {
    return channel;
  }
  if (channel.value === null) {
    return ok(null);
  }
  const release = await readRelease(channel.value.pointer, store);
  return release.ok ? ok({ ...release.value, pointerEtag: channel.value.etag }) : release;
};

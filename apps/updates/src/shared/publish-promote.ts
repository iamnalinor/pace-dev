import { err, ok, type Result } from "@pace/core";

import type {
  ChannelPointer,
  PublicationError,
  ReleaseRecord,
  ReleaseStore,
  StagedRelease,
} from "./store-types.ts";

import { channelKey, encodeRecord, sha256 } from "./release-codec.ts";
import { readChannel, readRelease } from "./release-read.ts";
import { verifyReleaseSignature } from "./release-signature.ts";
import { callStore } from "./store-operations.ts";

type Promotion = {
  readonly release: StagedRelease;
  readonly channel: string;
  readonly expectedEtag: null | string;
};
const verifyAssets = async (
  record: ReleaseRecord,
  store: ReleaseStore,
): Promise<Result<void, PublicationError>> => {
  for (const asset of record.assets) {
    const read = await callStore(async () => await store.read(asset.objectKey));
    if (!read.ok) {
      return read;
    }
    if (
      read.value?.bytes.length !== asset.size ||
      (await sha256(read.value.bytes)) !== asset.hash
    ) {
      return err("readback-failed");
    }
  }
  return ok(undefined);
};
const compatiblePromotion = async (
  input: Promotion,
  store: ReleaseStore,
): Promise<Result<void, PublicationError>> => {
  const current = await readChannel(
    { runtimeVersion: input.release.record.runtimeVersion, channel: input.channel },
    store,
  );
  if (!current.ok) {
    return current;
  }
  if ((current.value?.etag ?? null) !== input.expectedEtag) {
    return err("channel-conflict");
  }
  if (current.value === null) {
    return ok(undefined);
  }
  const previous = await readRelease(current.value.pointer, store);
  if (!previous.ok) {
    return previous;
  }
  const next = input.release.record;
  return previous.value.release.id !== next.id && previous.value.release.createdAt >= next.createdAt
    ? err("rollback-repackage-required")
    : ok(undefined);
};
/**
The release as stored now: its record, its manifest signed by the pinned key (what the swap would
serve to phones) and its assets' bytes.
*/
const readBack = async (
  release: StagedRelease,
  store: ReleaseStore,
): Promise<Result<ReleaseRecord, PublicationError>> => {
  const verified = await readRelease(
    {
      runtimeVersion: release.record.runtimeVersion,
      releaseId: release.record.id,
      releaseHash: release.recordHash,
    },
    store,
  );
  if (!verified.ok) {
    return verified;
  }
  const signature = await verifyReleaseSignature(verified.value.signed, release.publisherKey);
  if (!signature.ok) {
    return signature;
  }
  const assets = await verifyAssets(verified.value.release, store);
  return assets.ok ? ok(verified.value.release) : assets;
};
const promote = async (
  input: Promotion,
  store: ReleaseStore,
): Promise<
  Result<{ readonly etag: string; readonly pointer: ChannelPointer }, PublicationError>
> => {
  const next = input.release.record;
  const stored = await readBack(input.release, store);
  if (!stored.ok) {
    return stored;
  }
  const compatible = await compatiblePromotion(
    { ...input, release: { ...input.release, record: stored.value } },
    store,
  );
  if (!compatible.ok) {
    return compatible;
  }
  const pointer: ChannelPointer = {
    format: 1,
    runtimeVersion: next.runtimeVersion,
    channel: input.channel,
    releaseId: next.id,
    releaseHash: input.release.recordHash,
  };
  const written = await callStore(
    async () =>
      await store.compareAndSwap({
        key: channelKey(next.runtimeVersion, input.channel),
        expectedEtag: input.expectedEtag,
        bytes: encodeRecord(pointer),
      }),
  );
  if (!written.ok) {
    return written;
  }
  return written.value === null
    ? err("channel-conflict")
    : ok({ etag: written.value.etag, pointer });
};
/** Reverify immutable assets before the sole mutable operation: explicit channel CAS. */
export const promoteRelease = async (
  input: Promotion,
  store: ReleaseStore,
): Promise<
  Result<{ readonly etag: string; readonly pointer: ChannelPointer }, PublicationError>
> => {
  try {
    return await promote(input, store);
  } catch {
    return err("invalid-release");
  }
};

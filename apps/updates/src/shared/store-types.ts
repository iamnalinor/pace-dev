import type { Result } from "@pace/core";

export type StoredObject = { readonly bytes: Uint8Array; readonly etag: string };
export type StoreResult<T> = Promise<Result<T, "unavailable">>;
/** Null reads mean confirmed absence. CAS null means conflict; expected null requires absence. */
export type ReleaseStore = {
  readonly read: (key: string) => StoreResult<null | StoredObject>;
  readonly putIfAbsent: (input: {
    readonly key: string;
    readonly bytes: Uint8Array;
  }) => StoreResult<"created" | "exists">;
  readonly compareAndSwap: (input: {
    readonly key: string;
    readonly expectedEtag: null | string;
    readonly bytes: Uint8Array;
  }) => StoreResult<null | { readonly etag: string }>;
};
export type PublicationError =
  | "asset-mismatch"
  | "channel-conflict"
  | "immutable-collision"
  | "invalid-channel"
  | "invalid-release"
  | "readback-failed"
  | "rollback-repackage-required"
  | "runtime-mismatch"
  | "store-failed";
export type ReleaseAsset = {
  readonly objectKey: string;
  readonly hash: string;
  readonly key: string;
  readonly size: number;
  readonly contentType: string;
};
export type ReleaseRecord = {
  readonly format: 1;
  readonly id: string;
  readonly runtimeVersion: string;
  readonly createdAt: string;
  readonly assetOrigin: string;
  readonly manifestHash: string;
  readonly signature: string;
  readonly signatureHeader: string;
  readonly assets: readonly ReleaseAsset[];
};
export type StagedRelease = { readonly record: ReleaseRecord; readonly recordHash: string };
export type ChannelPointer = {
  readonly format: 1;
  readonly channel: string;
  readonly runtimeVersion: string;
  readonly releaseId: string;
  readonly releaseHash: string;
};

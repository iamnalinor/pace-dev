import { err, ok, type Result } from "@pace/core";

import type { PublicationError, ReleaseStore, StoreResult } from "./store-types.ts";

export type WriteObject = { readonly key: string; readonly bytes: Uint8Array };
export const callStore = async <T>(
  work: () => StoreResult<T>,
): Promise<Result<T, PublicationError>> => {
  try {
    const result = await work();
    return result.ok ? result : err("store-failed");
  } catch {
    return err("store-failed");
  }
};
const hasMatchingBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);
export const putVerified = async (
  object: WriteObject,
  store: ReleaseStore,
): Promise<Result<void, PublicationError>> => {
  const written = await callStore(async () => await store.putIfAbsent(object));
  if (!written.ok) {
    return written;
  }
  const read = await callStore(async () => await store.read(object.key));
  if (!read.ok) {
    return read;
  }
  if (read.value === null) {
    return err("readback-failed");
  }
  if (!hasMatchingBytes(object.bytes, read.value.bytes)) {
    return err(written.value === "exists" ? "immutable-collision" : "readback-failed");
  }
  return ok(undefined);
};
export const writeObjects = async (
  objects: readonly WriteObject[],
  store: ReleaseStore,
): Promise<Result<void, PublicationError>> => {
  for (const object of objects) {
    const result = await putVerified(object, store);
    if (!result.ok) {
      return result;
    }
  }
  return ok(undefined);
};

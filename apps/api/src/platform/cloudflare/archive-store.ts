import { err, ok, type Result } from "@pace/core";

import type { ArchiveIoError, ArchiveStore } from "../../shared/ports/archive-store.ts";

/** All bucket failures share one portable error; provider exceptions never cross the port. */
const attempt = async <T>(operation: () => Promise<T>): Promise<Result<T, ArchiveIoError>> => {
  try {
    return ok(await operation());
  } catch {
    return err("archive/unavailable");
  }
};

/** R2 evaluates the create condition atomically; never emulate it with GET then PUT. */
export const archiveStore = (bucket: R2Bucket): ArchiveStore => ({
  putIfAbsent: async (key, bytes) =>
    await attempt(async () => {
      const object = await bucket.put(key, Uint8Array.from(bytes).buffer, {
        onlyIf: { etagDoesNotMatch: "*" },
      });
      return object === null ? "exists" : "created";
    }),
  get: async (key) =>
    await attempt(async () => {
      const object = await bucket.get(key);
      return object === null ? null : new Uint8Array(await object.arrayBuffer());
    }),
  list: async (input) =>
    await attempt(async () => {
      const page = await bucket.list(input);
      return {
        keys: page.objects.map((object) => object.key),
        ...(page.truncated && { cursor: page.cursor }),
      };
    }),
  delete: async (key) =>
    await attempt(async () => {
      await bucket.delete(key);
    }),
});

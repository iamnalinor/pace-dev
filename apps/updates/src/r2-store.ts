import { err, ok } from "@pace/core";

import type { ReleaseStore } from "./shared/store-types.ts";

/** R2 conditionals are evaluated atomically by storage, never by a read-then-write approximation. */
export const createReleaseStore = (bucket: R2Bucket): ReleaseStore => ({
  read: async (key) => {
    try {
      const object = await bucket.get(key);
      return ok(
        object === null
          ? null
          : {
              bytes: new Uint8Array(await object.arrayBuffer()),
              etag: object.etag,
            },
      );
    } catch {
      return err("unavailable");
    }
  },
  putIfAbsent: async ({ key, bytes }) => {
    try {
      const object = await bucket.put(key, Uint8Array.from(bytes).buffer, {
        onlyIf: { etagDoesNotMatch: "*" },
      });
      return ok(object === null ? "exists" : "created");
    } catch {
      return err("unavailable");
    }
  },
  compareAndSwap: async ({ key, expectedEtag, bytes }) => {
    try {
      const onlyIf =
        expectedEtag === null ? { etagDoesNotMatch: "*" } : { etagMatches: expectedEtag };
      const object = await bucket.put(key, Uint8Array.from(bytes).buffer, { onlyIf });
      return ok(object === null ? null : { etag: object.etag });
    } catch {
      return err("unavailable");
    }
  },
});

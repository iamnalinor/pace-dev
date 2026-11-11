import { ok } from "@pace/core";

import type { ArchiveStore } from "../src/shared/ports/archive-store.ts";

/** Failure injection stays at the object-store port; SQL remains real workerd SQLite. */
export const memoryArchive = () => {
  const objects = new Map<string, Uint8Array>();
  const calls: string[] = [];
  const store: ArchiveStore = {
    putIfAbsent: async (key, bytes) => {
      calls.push(`put:${key}`);
      if (objects.has(key)) {
        return ok("exists");
      }
      objects.set(key, Uint8Array.from(bytes));
      return ok("created");
    },
    get: async (key) => {
      calls.push(`get:${key}`);
      return ok(objects.get(key) ?? null);
    },
    delete: async (key) => {
      objects.delete(key);
      return ok(undefined);
    },
    list: async ({ prefix, cursor, limit }) => {
      const keys = objects
        .keys()
        .filter((key) => key.startsWith(prefix))
        .toArray()
        .toSorted((left, right) => left.localeCompare(right));
      const start = cursor === undefined ? 0 : Number(cursor);
      return ok({
        keys: keys.slice(start, start + limit),
        ...(keys.length > start + limit && { cursor: String(start + limit) }),
      });
    },
  };
  return { store, objects, calls };
};

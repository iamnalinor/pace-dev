import type { ReleaseStore, StoredObject } from "@pace/updates/store-types";

import { err, ok } from "@pace/core";

export class MemoryReleaseStore {
  private version = 0;
  readonly objects = new Map<string, StoredObject>();
  readonly calls: string[] = [];
  failures = new Set<string>();
  corruptKey: null | string = null;
  beforeCas: (() => void) | null = null;
  readonly port: ReleaseStore = {
    read: async (key) => {
      await Promise.resolve();
      this.calls.push(`read:${key}`);
      if (this.failures.has(`read:${key}`)) {
        return err("unavailable");
      }
      const stored = this.objects.get(key);
      if (stored === undefined) {
        return ok(null);
      }
      const bytes = key === this.corruptKey ? new Uint8Array([0]) : Uint8Array.from(stored.bytes);
      return ok({ bytes, etag: stored.etag });
    },
    putIfAbsent: async ({ key, bytes }) => {
      await Promise.resolve();
      this.calls.push(`put:${key}`);
      if (this.failures.has(`put:${key}`)) {
        return err("unavailable");
      }
      if (this.objects.has(key)) {
        return ok("exists");
      }
      this.write(key, bytes);
      return ok("created");
    },
    compareAndSwap: async ({ key, expectedEtag, bytes }) => {
      await Promise.resolve();
      this.calls.push(`cas:${key}`);
      this.beforeCas?.();
      if (this.failures.has(`cas:${key}`)) {
        return err("unavailable");
      }
      if ((this.objects.get(key)?.etag ?? null) !== expectedEtag) {
        return ok(null);
      }
      return ok({ etag: this.write(key, bytes) });
    },
  };
  write(key: string, bytes: Uint8Array): string {
    this.version += 1;
    const etag = `etag-${this.version}`;
    this.objects.set(key, { bytes: Uint8Array.from(bytes), etag });
    return etag;
  }
}

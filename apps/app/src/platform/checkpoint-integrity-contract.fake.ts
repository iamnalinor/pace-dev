import type { EventStore, Sha256Text } from "@pace/client";

import {
  checkpointFixture,
  checkpointTestHash,
  pendingEvent,
} from "#app/platform/checkpoint-store-contract.fake.ts";

type Metadata = Readonly<Record<string, string>>;
type Backend = {
  readonly open: (hash?: Sha256Text) => Promise<EventStore>;
  readonly readMeta: () => Promise<Metadata>;
  readonly writeMeta: (meta: Metadata) => Promise<void>;
};

/** Persisted corruption never turns an incomplete source into a successful empty account. */
export const checkpointIntegrityContract = (backend: Backend): void => {
  it.each(["json", "hash", "schema"] as const)(
    "keeps original partial source and identity when persisted checkpoint %s is corrupt",
    async (kind) => {
      const store = await backend.open();
      await store.setOwner("owner-a");
      await store.append([pendingEvent], await store.readMeta());
      const checkpoint = await checkpointFixture();
      await store.installBootstrap({
        guard: await store.readSnapshot(),
        checkpoint,
        records: [],
        seq: 1,
        syncVersion: 2,
      });
      const before = await store.readSnapshot();
      const validJson = kind === "schema" ? "{}" : checkpoint.json;
      const json = kind === "json" ? "{" : validJson;
      await backend.writeMeta({
        checkpointJson: json,
        checkpointSha256: kind === "hash" ? "0".repeat(64) : await checkpointTestHash(json),
      });
      const disk = await backend.readMeta();
      const reopened = await backend.open();
      expect(await reopened.readSnapshot()).toEqual({
        ...before,
        checkpoint: null,
        coverage: "checkpoint",
      });
      expect(await reopened.listPending()).toEqual([pendingEvent]);
      expect(await backend.readMeta()).toEqual(disk);
    },
  );

  it("rejects a failed hashing service while preserving the original stored copy", async () => {
    const store = await backend.open();
    await store.append([pendingEvent], await store.readMeta());
    await store.installBootstrap({
      guard: await store.readSnapshot(),
      checkpoint: await checkpointFixture(),
      records: [],
      seq: 1,
      syncVersion: 2,
    });
    const before = await store.readSnapshot();
    const failed = await backend.open(async () => {
      throw new Error("hash service failed");
    });
    await expect(failed.readSnapshot()).rejects.toThrow("hash service failed");
    expect(await store.readSnapshot()).toEqual(before);
  });
};

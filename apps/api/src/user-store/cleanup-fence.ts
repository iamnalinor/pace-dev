import { err, ok, type Result } from "@pace/core";

import type { AccountCleanup, CleanupError } from "../shared/account-cleanup-types.ts";
import type { Db } from "../shared/db/d1.ts";
import type { ActorStorage } from "../shared/ports/actor-storage.ts";

import {
  findAccountCleanup,
  getPendingAccountCleanup,
} from "../shared/account-cleanup-repository.ts";
import { openStore, resetStore, STORE_EPOCH, storeIdOf } from "./store-identity.ts";

const FENCE_KEY = "cleanup:fence";
type Options = {
  readonly storage: ActorStorage;
  readonly db: Db;
  readonly owner: string | undefined;
  readonly migrate: () => Promise<void>;
  readonly hasArchive: boolean;
};

export const hasArchiveEvidence = async (storage: ActorStorage): Promise<boolean> => {
  if ((await storage.get("archive:ever")) === true) {
    return true;
  }
  const table = storage.sql
    .exec("SELECT name FROM sqlite_master WHERE name = '_history_archive_operations'")
    .toArray();
  return (
    table.length > 0 &&
    storage.sql.exec("SELECT id FROM _history_archive_operations LIMIT 1").toArray().length > 0
  );
};

/** The D1 operation survives deleteAll; healthy unfenced actors never query it. */
export class CleanupFence {
  readonly #options: Options;
  #operationId: string | undefined;
  #isReady = false;
  constructor(options: Options) {
    this.#options = options;
  }

  async #operation(id: string): Promise<Result<AccountCleanup, CleanupError>> {
    const result = await findAccountCleanup(this.#options.db, id);
    if (!result.ok) {
      return result;
    }
    if (result.value === undefined || result.value.userId !== this.#options.owner) {
      return err("cleanup/invalid");
    }
    return ok(result.value);
  }

  async #install(id: string): Promise<void> {
    this.#operationId = id;
    await this.#options.storage.put(FENCE_KEY, id);
  }

  async #recoverUnready(): Promise<AccountCleanup | undefined> {
    const owner = this.#options.owner;
    if (owner === undefined) {
      return undefined;
    }
    const pending = await getPendingAccountCleanup(this.#options.db, owner);
    if (!pending.ok) {
      throw new Error(pending.error);
    }
    return pending.value;
  }

  async #reconcile(id: string): Promise<void> {
    const operation = await this.#operation(id);
    if (!operation.ok) {
      throw new Error(operation.error);
    }
    if (operation.value.stage === "complete") {
      await this.#options.storage.delete(FENCE_KEY);
      this.#operationId = undefined;
      return;
    }
    this.#operationId = id;
  }

  async open(): Promise<void> {
    const storage = this.#options.storage;
    const epoch = await storage.get<number>("epoch");
    const existing = await storage.get<string>(FENCE_KEY);
    const pending = epoch === STORE_EPOCH ? undefined : await this.#recoverUnready();
    if (epoch !== STORE_EPOCH && (await hasArchiveEvidence(storage))) {
      throw new Error("cleanup/archive-unavailable");
    }
    if (existing !== undefined && epoch === STORE_EPOCH) {
      await this.#reconcile(existing);
    }
    await openStore(storage, this.#options.migrate, {
      ...(pending?.sourceStoreId !== null &&
        pending !== undefined && { storeId: pending.nextStoreId }),
      beforeReady: async () => {
        if (pending !== undefined) {
          await this.#install(pending.id);
        }
      },
    });
    this.#isReady = true;
  }

  canWrite(): boolean {
    return this.#isReady && this.#operationId === undefined;
  }

  async assertWritable(): Promise<void> {
    if (this.#isReady && this.#operationId !== undefined) {
      await this.#reconcile(this.#operationId);
    }
    if (!this.canWrite()) {
      throw new Error("cleanup/busy");
    }
  }

  async begin(
    id: string,
  ): Promise<
    Result<{ readonly sourceStoreId: string; readonly archiveRequired: boolean }, CleanupError>
  > {
    const found = await this.#operation(id);
    if (!found.ok) {
      return found;
    }
    if (found.value.stage === "complete") {
      return err("cleanup/invalid");
    }
    const existing = await this.#options.storage.get<string>(FENCE_KEY);
    if (existing !== undefined && existing !== id) {
      return err("cleanup/busy");
    }
    await this.#install(id);
    return ok({
      sourceStoreId: await storeIdOf(this.#options.storage),
      archiveRequired:
        this.#options.hasArchive || (await hasArchiveEvidence(this.#options.storage)),
    });
  }

  async reset(input: {
    readonly operationId: string;
    readonly expectedStoreId: string;
  }): Promise<Result<{ readonly storeId: string }, CleanupError>> {
    const found = await this.#operation(input.operationId);
    if (!found.ok) {
      return found;
    }
    const operation = found.value;
    if (
      operation.sourceStoreId !== input.expectedStoreId ||
      !["archives-cleared", "reset", "identity-cleared", "sockets-closed"].includes(operation.stage)
    ) {
      return err("cleanup/invalid");
    }
    await this.#install(operation.id);
    const current = await storeIdOf(this.#options.storage);
    if (current !== input.expectedStoreId) {
      return ok({ storeId: current });
    }
    await resetStore(this.#options.storage, this.#options.migrate, {
      storeId: operation.nextStoreId,
      beforeReady: async () => {
        await this.#install(operation.id);
      },
    });
    return ok({ storeId: operation.nextStoreId });
  }

  async finish(id: string): Promise<Result<void, CleanupError>> {
    const found = await this.#operation(id);
    if (!found.ok) {
      return found;
    }
    if (found.value.stage !== "complete") {
      return err("cleanup/busy");
    }
    const existing = await this.#options.storage.get<string>(FENCE_KEY);
    if (existing !== undefined && existing !== id) {
      return err("cleanup/invalid");
    }
    await this.#options.storage.delete(FENCE_KEY);
    this.#operationId = undefined;
    this.#isReady = true;
    return ok(undefined);
  }
}

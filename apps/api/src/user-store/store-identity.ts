import type { ActorStorage } from "../shared/ports/actor-storage.ts";

import migrations from "../../drizzle/do/migrations.js";
import { randomBase64Url } from "../shared/crypto.ts";

/**
The generation of every store's data. A store that started under another epoch (or before
epochs existed) is emptied when it next starts: raising this drops all users' data at once,
so a breaking change never needs a data migration.
*/
export const STORE_EPOCH = 2;

/** The newest migration the store runs: what its tables look like. */
export const SCHEMA_TAG = migrations.journal.entries.at(-1)?.tag ?? "none";

const EPOCH_KEY = "epoch";
const STORE_ID_KEY = "storeId";

/**
The store's random id (16 bytes, base64url), made on first use. Clearing the storage forgets
it, so a wiped store answers a new one and clients know to drop their local copy.
*/
export const storeIdOf = async (storage: ActorStorage): Promise<string> => {
  const existing = await storage.get<string>(STORE_ID_KEY);
  if (existing !== undefined) {
    return existing;
  }
  const created = randomBase64Url(16);
  await storage.put(STORE_ID_KEY, created);
  return created;
};

/** Every row, key and the alarm: what a wipe and an epoch change both drop. */
const clear = async (storage: ActorStorage): Promise<void> => {
  await storage.deleteAlarm();
  await storage.deleteAll();
};

/** Migrates, then stamps the current epoch and the store id (a new one after a clear). */
type ReadyOptions = { readonly storeId?: string; readonly beforeReady?: () => Promise<void> };
const prepare = async (
  storage: ActorStorage,
  migrate: () => Promise<void>,
  options: ReadyOptions,
): Promise<void> => {
  await migrate();
  if (options.storeId !== undefined) {
    await storage.put(STORE_ID_KEY, options.storeId);
  }
  await storeIdOf(storage);
  await options.beforeReady?.();
  // The final readiness stamp must never precede restoring an in-progress cleanup fence.
  await storage.put(EPOCH_KEY, STORE_EPOCH);
};

/** Readies a starting store: one from another epoch is emptied before it migrates. */
export const openStore = async (
  storage: ActorStorage,
  migrate: () => Promise<void>,
  options: ReadyOptions = {},
): Promise<void> => {
  if ((await storage.get<number>(EPOCH_KEY)) !== STORE_EPOCH) {
    await clear(storage);
  }
  await prepare(storage, migrate, options);
};

/** Empties the store and readies it again under a new store id. */
export const resetStore = async (
  storage: ActorStorage,
  migrate: () => Promise<void>,
  options: ReadyOptions = {},
): Promise<void> => {
  await clear(storage);
  await prepare(storage, migrate, options);
};

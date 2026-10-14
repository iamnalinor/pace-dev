import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import type * as schema from "./schema.ts";

import migrations from "../../drizzle/do/migrations.js";
import { randomBase64Url } from "../shared/crypto.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

/**
The generation of every store's data. A store that started under another epoch (or before
epochs existed) is emptied when it next starts: raising this drops all users' data at once,
so a breaking change never needs a data migration.
*/
export const STORE_EPOCH = 2;

const EPOCH_KEY = "epoch";
const STORE_ID_KEY = "storeId";

/**
The store's random id (16 bytes, base64url), made on first use. Clearing the storage forgets
it, so a wiped store answers a new one and clients know to drop their local copy.
*/
export const storeIdOf = async (storage: DurableObjectStorage): Promise<string> => {
  const existing = await storage.get<string>(STORE_ID_KEY);
  if (existing !== undefined) {
    return existing;
  }
  const created = randomBase64Url(16);
  await storage.put(STORE_ID_KEY, created);
  return created;
};

/** Every row, key and the alarm: what a wipe and an epoch change both drop. */
const clear = async (storage: DurableObjectStorage): Promise<void> => {
  await storage.deleteAlarm();
  await storage.deleteAll();
};

/** Migrates, then stamps the current epoch and the store id (a new one after a clear). */
const prepare = async (db: Db, storage: DurableObjectStorage): Promise<void> => {
  await migrate(db, migrations);
  await storage.put(EPOCH_KEY, STORE_EPOCH);
  await storeIdOf(storage);
};

/** Readies a starting store: one from another epoch is emptied before it migrates. */
export const openStore = async (db: Db, storage: DurableObjectStorage): Promise<void> => {
  if ((await storage.get<number>(EPOCH_KEY)) !== STORE_EPOCH) {
    await clear(storage);
  }
  await prepare(db, storage);
};

/** Empties the store and readies it again under a new store id. */
export const resetStore = async (db: Db, storage: DurableObjectStorage): Promise<void> => {
  await clear(storage);
  await prepare(db, storage);
};

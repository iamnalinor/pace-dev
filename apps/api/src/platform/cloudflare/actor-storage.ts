import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import type { ActorStorage } from "../../shared/ports/actor-storage.ts";

import migrations from "../../../drizzle/do/migrations.js";
import * as schema from "../../user-store/schema.ts";

export const actorDatabase = (
  storage: DurableObjectStorage,
): DrizzleSqliteDODatabase<typeof schema> => drizzle(storage, { casing: "snake_case", schema });

export const actorStorage = (storage: DurableObjectStorage): ActorStorage => ({
  delete: storage.delete.bind(storage),
  deleteAlarm: async () => {
    await storage.deleteAlarm();
  },
  deleteAll: async () => {
    await storage.deleteAll();
  },
  get: storage.get.bind(storage),
  getAlarm: async () => await storage.getAlarm(),
  list: storage.list.bind(storage),
  put: storage.put.bind(storage),
  setAlarm: async (at) => {
    await storage.setAlarm(at);
  },
  sql: { exec: storage.sql.exec.bind(storage.sql) },
  transactionSync: storage.transactionSync.bind(storage),
});

/** The committed migration runner belongs to the SQLite driver adapter. */
export const migrateActor = async (storage: DurableObjectStorage): Promise<void> => {
  await migrate(actorDatabase(storage), migrations);
};

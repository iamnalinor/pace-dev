import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import postgres from "postgres";

const MIGRATIONS_FOLDER = path.join(import.meta.dir, "../../../drizzle");

// Arbitrary constant shared by every replica of this service.
const MIGRATION_LOCK_ID = 7_294_615;

/**
 * Applies all pending migrations, up to the latest one. Safe to run from several
 * replicas at once: a session-level advisory lock serializes them, and drizzle
 * skips migrations that are already recorded as applied.
 */
export const runMigrations = async (url: string): Promise<void> => {
  const client = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await client`select pg_advisory_lock(${MIGRATION_LOCK_ID})`;
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
};

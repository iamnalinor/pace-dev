/**
 * Loaded once per `bun test:integration` run (see package.json):
 * starts ONE PostgreSQL, applies the real migrations, and exposes the URL to tests.
 *
 * - Default: a throwaway container via Testcontainers (needs Docker).
 * - `TEST_DATABASE_URL` set: uses that server instead (CI service container, or a
 *   machine without Docker) and creates a fresh uniquely named database on it.
 */
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll } from "bun:test";
import postgres from "postgres";

import { runMigrations } from "../../src/shared/db/migrate.ts";

const POSTGRES_IMAGE = "postgres:17-alpine";

const createDatabaseOn = async (
  serverUrl: string,
): Promise<{ stop: () => Promise<void>; url: string }> => {
  const name = `test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = postgres(serverUrl, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`create database "${name}"`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return {
    stop: async () => {
      await admin.unsafe(`drop database if exists "${name}" with (force)`);
      await admin.end();
    },
    url: url.href,
  };
};

const startDatabase = async (): Promise<{ stop: () => Promise<void>; url: string }> => {
  const serverUrl = Bun.env["TEST_DATABASE_URL"];
  if (serverUrl !== undefined && serverUrl !== "") {
    return await createDatabaseOn(serverUrl);
  }
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  return {
    stop: async () => {
      await container.stop();
    },
    url: container.getConnectionUri(),
  };
};

const database = await startDatabase();
await runMigrations(database.url);
process.env["INTEGRATION_DATABASE_URL"] = database.url;

afterAll(async () => {
  await database.stop();
});

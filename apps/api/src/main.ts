import { createApp } from "./app.ts";
import { createAuth } from "./auth/auth.ts";
import { systemClock } from "./shared/clock.ts";
import { parseConfig } from "./shared/config.ts";
import { createDatabase } from "./shared/db/client.ts";
import { runMigrations } from "./shared/db/migrate.ts";
import { createLogger } from "./shared/logger.ts";

const config = parseConfig(Bun.env);
if (!config.ok) {
  console.error(`Invalid configuration:\n  ${config.error.join("\n  ")}`);
  process.exit(1);
}
const {
  AUTH_RATE_LIMIT,
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  DATABASE_URL,
  LOG_LEVEL,
  NODE_ENV,
  PORT,
} = config.value;
const logger = createLogger(LOG_LEVEL);

// Schema first: the app never serves traffic against an outdated database.
await runMigrations(DATABASE_URL);
logger.info("Migrations applied");

const database = createDatabase(DATABASE_URL);
const app = createApp({
  auth: createAuth({
    baseUrl: BETTER_AUTH_URL,
    db: database.db,
    // On in production only (better-auth's own default); AUTH_RATE_LIMIT=false opts out there.
    rateLimit: NODE_ENV === "production" && AUTH_RATE_LIMIT,
    secret: BETTER_AUTH_SECRET,
  }),
  clock: systemClock,
  db: database.db,
  exposeApiDocs: NODE_ENV !== "production",
  logger,
  trustedOrigin: new URL(BETTER_AUTH_URL).origin,
}).listen(PORT);
logger.info("API listening", { port: app.server?.port });

const shutdown = async (signal: string): Promise<void> => {
  logger.info("Shutting down", { signal });
  await app.stop();
  await database.close();
  process.exit(0);
};
process.once("SIGTERM", (signal) => void shutdown(signal));
process.once("SIGINT", (signal) => void shutdown(signal));

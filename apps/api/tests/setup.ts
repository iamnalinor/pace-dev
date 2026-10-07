import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// The D1 binding starts empty in every test file: apply the committed migrations.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

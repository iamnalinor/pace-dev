import type { D1Migration } from "@cloudflare/vitest-plugin";

declare global {
  namespace Cloudflare {
    // Bindings vitest.config.ts adds on top of wrangler.jsonc.
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      /** An empty D1 the migration tests apply older migrations to. */
      MIGRATION_DB: D1Database;
    }
    // Lets `exports.default.fetch()` from "cloudflare:workers" loop back into this Worker, typed.
    interface GlobalProps {
      mainModule: typeof import("../src/worker.ts");
    }
  }
}

export {};

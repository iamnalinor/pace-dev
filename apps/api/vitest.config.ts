import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests run inside workerd with real D1, KV and Durable Object bindings taken from
 * wrangler.jsonc. D1 migrations are applied per test file by tests/setup.ts.
 */
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        bindings: {
          ENVIRONMENT: "test",
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "drizzle/d1")),
        },
      },
      wrangler: { configPath: "./wrangler.jsonc" },
    })),
  ],
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
});

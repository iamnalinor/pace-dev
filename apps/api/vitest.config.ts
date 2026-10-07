import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import path from "node:path";
import { defineConfig } from "vitest/config";

/**
Tests run inside workerd with real D1, KV and Durable Object bindings taken from
wrangler.jsonc. D1 migrations are applied per test file by tests/setup.ts.
*/
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        bindings: {
          ENVIRONMENT: "test",
          // Every test request is addressed to this origin (tests/helpers.ts): the OAuth
          // provider binds its issuer and the MCP resource to it.
          API_ORIGIN: "https://pace-api.test",
          ALLOWED_TELEGRAM_IDS: "1001,1002",
          TELEGRAM_BOT_USERNAME: "PaceTestBot",
          // Fake secrets: the widget tests sign their own payloads with this token.
          TELEGRAM_BOT_TOKEN: "123456:TEST-TOKEN",
          TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
          // The real Telegram subnets: webhook tests send CF-Connecting-IP from inside or outside them.
          TELEGRAM_WEBHOOK_ALLOWED_CIDRS: "149.154.160.0/20,91.108.4.0/22",
          // Outgoing Telegram calls go to a host the tests intercept with fetchMock.
          TELEGRAM_API_ROOT: "https://telegram.test",
          BOT_INFO: JSON.stringify({
            id: 777,
            is_bot: true,
            first_name: "Pace",
            username: "PaceTestBot",
          }),
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

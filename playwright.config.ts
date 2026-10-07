import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const API_PORT = 8787;
const WEB_PORT = 4173;
// Set E2E_BASE_URL to test an already running stack instead of starting the API and web here.
const externalBaseUrl = process.env["E2E_BASE_URL"];
const WEB_URL = externalBaseUrl ?? `http://localhost:${String(WEB_PORT)}`;
const isCi = process.env["CI"] !== undefined;
// Wrangler's local state for the e2e Worker lives outside apps/api so a run never reuses
// yesterday's events. Absolute: the commands below run from the root and from apps/api.
const E2E_STATE_DIR = path.resolve(import.meta.dirname, ".cache/e2e-state");
// Every e2e test signs in with its own Telegram id (see e2e/support/login.ts) so parallel tests
// never share account state (language, time zone) through the server.
const E2E_TELEGRAM_IDS = "1919230638,1001,1002,1003";

// Optional: a pre-installed Chromium instead of `playwright install` (e.g. sandboxes).
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"];

/**
 * End-to-end: the production web build (vite preview) against the real Worker running
 * locally in wrangler dev (workerd with local D1/KV/Durable Objects, ENVIRONMENT=test).
 */
export default defineConfig({
  forbidOnly: isCi,
  fullyParallel: true,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(executablePath !== undefined && { launchOptions: { executablePath } }),
      },
    },
  ],
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : [["list"]],
  retries: 0,
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  use: {
    baseURL: WEB_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer:
    externalBaseUrl === undefined
      ? [
          {
            // A fresh local state per run (D1, KV, Durable Objects): wipe it, apply the committed
            // migrations, then start the Worker. Each test signs in with its own whitelisted id.
            command: [
              `rm -rf ${E2E_STATE_DIR}`,
              `bunx wrangler d1 migrations apply DB --local --env dev --config apps/api/wrangler.jsonc --persist-to ${E2E_STATE_DIR}`,
              `bun run --cwd apps/api dev -- --env dev --persist-to ${E2E_STATE_DIR} --var ENVIRONMENT:test --var WEB_ORIGIN:${WEB_URL} --var ALLOWED_TELEGRAM_IDS:${E2E_TELEGRAM_IDS}`,
            ].join(" && "),
            reuseExistingServer: !isCi,
            url: `http://localhost:${String(API_PORT)}/api/health`,
          },
          {
            command: "bun run --cwd apps/web build && bun run --cwd apps/web preview",
            // VITE_DEV_LOGIN shows the dev login form in the production build (the tests use it).
            env: { VITE_API_URL: `http://localhost:${String(API_PORT)}`, VITE_DEV_LOGIN: "1" },
            reuseExistingServer: !isCi,
            url: WEB_URL,
          },
        ]
      : [],
});

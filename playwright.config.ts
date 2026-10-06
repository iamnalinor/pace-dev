import { defineConfig, devices } from "@playwright/test";

const API_PORT = 8787;
const WEB_PORT = 4173;
// Set E2E_BASE_URL to test an already running stack instead of starting the API and web here.
const externalBaseUrl = process.env["E2E_BASE_URL"];
const WEB_URL = externalBaseUrl ?? `http://localhost:${String(WEB_PORT)}`;
const isCi = process.env["CI"] !== undefined;

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
            command: `bun run --cwd apps/api dev -- --env dev --var ENVIRONMENT:test --var WEB_ORIGIN:${WEB_URL}`,
            reuseExistingServer: !isCi,
            url: `http://localhost:${String(API_PORT)}/api/health`,
          },
          {
            command: "bun run --cwd apps/web build && bun run --cwd apps/web preview",
            env: { VITE_API_URL: `http://localhost:${String(API_PORT)}` },
            reuseExistingServer: !isCi,
            url: WEB_URL,
          },
        ]
      : [],
});

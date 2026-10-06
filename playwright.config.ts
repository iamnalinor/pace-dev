import { defineConfig, devices } from "@playwright/test";

const API_PORT = 3100;
const WEB_PORT = 4173;
// Set E2E_BASE_URL to test an already running stack (e.g. docker compose on :8080)
// instead of starting the API and `vite preview` here.
const externalBaseUrl = process.env["E2E_BASE_URL"];
const WEB_URL = externalBaseUrl ?? `http://localhost:${String(WEB_PORT)}`;
const isCi = process.env["CI"] !== undefined;

// A dedicated database: created if missing and migrated by the API on startup.
const databaseUrl =
  process.env["E2E_DATABASE_URL"] ?? "postgres://postgres:postgres@localhost:5432/template_e2e";

// Optional: a pre-installed Chromium instead of `playwright install` (e.g. sandboxes).
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"];

/**
 * End-to-end: the production web build (vite preview, proxying /api) against the
 * real API and a real PostgreSQL — the same topology as docker-compose.
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
            command: "bun e2e/support/create-database.ts && bun apps/api/src/main.ts",
            env: {
              BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0000",
              BETTER_AUTH_URL: WEB_URL,
              DATABASE_URL: databaseUrl,
              LOG_LEVEL: "error",
              NODE_ENV: "test",
              PORT: String(API_PORT),
              TZ: "UTC",
            },
            reuseExistingServer: !isCi,
            url: `http://localhost:${String(API_PORT)}/api/health/ready`,
          },
          {
            command: "bun run --cwd apps/web build && bun run --cwd apps/web preview",
            env: { API_URL: `http://localhost:${String(API_PORT)}` },
            reuseExistingServer: !isCi,
            url: WEB_URL,
          },
        ]
      : [],
});

import { describe, expect, test } from "bun:test";

import { parseConfig } from "./config.ts";

const valid = {
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:5173",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/template",
};

describe("parseConfig", () => {
  test("applies defaults and converts strings from the environment", () => {
    expect(parseConfig({ ...valid, PORT: "8080", UNRELATED: "dropped" })).toEqual({
      ok: true,
      value: {
        ...valid,
        AUTH_RATE_LIMIT: true,
        LOG_LEVEL: "info",
        NODE_ENV: "development",
        PORT: 8080,
      },
    });
  });

  test("AUTH_RATE_LIMIT can be switched off from the environment", () => {
    const result = parseConfig({ ...valid, AUTH_RATE_LIMIT: "false" });

    expect(result.ok && result.value.AUTH_RATE_LIMIT).toBe(false);
  });

  test("reports every invalid variable at once, one message each", () => {
    const result = parseConfig({ BETTER_AUTH_SECRET: "short", PORT: "not-a-port" });

    expect(result.ok).toBe(false);
    const variables = result.ok ? [] : result.error.map((message) => message.split(":", 1)[0]);
    expect(variables.toSorted((a, b) => (a ?? "").localeCompare(b ?? ""))).toEqual([
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "DATABASE_URL",
      "PORT",
    ]);
  });

  test("refuses the .env.example placeholder secret in production only", () => {
    const placeholder = { ...valid, BETTER_AUTH_SECRET: "change-me-change-me-change-me-change-me" };

    expect(parseConfig(placeholder).ok).toBe(true);
    expect(parseConfig({ ...placeholder, NODE_ENV: "production" }).ok).toBe(false);
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { Logger } from "../../src/shared/logger.ts";

import { startTestApp, type TestApp, type TestUser } from "./test-app.ts";

describe("unexpected errors", () => {
  const logged: { context: object | undefined; message: string }[] = [];
  const logger: Logger = {
    debug: () => undefined,
    error: (message, context) => {
      logged.push({ context, message });
    },
    info: () => undefined,
  };
  let app: TestApp;
  let alice: TestUser;

  beforeAll(async () => {
    app = await startTestApp({ logger });
    alice = await app.signUp("Alice");
    await app.breakDatabase();
  });
  afterAll(async () => {
    await app.stop();
  });

  test("return a generic 500 without leaking internals, and are logged", async () => {
    const response = await fetch(`${app.baseUrl}/api/me`, {
      headers: { cookie: alice.cookie },
    });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ code: "internal", message: "Internal server error" });
    expect(body).not.toContain("select");
    expect(logged).toEqual([
      {
        context: { code: "UNKNOWN", error: expect.any(String) as string },
        message: "Unhandled error",
      },
    ]);
  });

  test("readiness reports the database as unavailable", async () => {
    const { error } = await app.anonymous.health.ready.get();

    expect(error?.status).toBe(503);
    expect(error?.value).toEqual({ status: "unavailable" });
  });
});

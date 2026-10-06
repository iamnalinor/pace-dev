import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { startTestApp, type TestApp } from "./test-app.ts";

describe("health", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  test("liveness and readiness report ok against a reachable database", async () => {
    expect((await app.anonymous.health.get()).data).toEqual({ status: "ok" });
    expect((await app.anonymous.health.ready.get()).data).toEqual({ status: "ready" });
  });

  test("unknown routes return a JSON 404", async () => {
    const response = await fetch(`${app.baseUrl}/api/nope`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "not-found", message: "Not found" });
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { startTestApp, type TestApp } from "./test-app.ts";

describe("public API contract", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  test("the Eden client is precisely typed, not `any` (guards elysiajs/eden#215)", () => {
    type IsAny<T> = 0 extends 1 & T ? true : false;
    type MeResponse = Awaited<ReturnType<TestApp["anonymous"]["me"]["get"]>>;
    const isClientAny: IsAny<TestApp["anonymous"]> = false;
    const isMeAny: IsAny<NonNullable<MeResponse["data"]>> = false;

    expect([isClientAny, isMeAny]).toEqual([false, false]);
  });

  // Any change to routes, schemas or status codes shows up as a snapshot diff in review.
  // After an intended change: `bun test:integration --update-snapshots`.
  test("the OpenAPI document matches the snapshot", async () => {
    const response = await fetch(`${app.baseUrl}/api/docs/json`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchSnapshot();
  });
});

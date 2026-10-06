import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { startTestApp, type TestApp, type TestUser } from "./test-app.ts";

describe("request security", () => {
  let app: TestApp;
  let alice: TestUser;
  beforeAll(async () => {
    app = await startTestApp();
    alice = await app.signUp("Alice");
  });
  afterAll(async () => {
    await app.stop();
  });

  test("a state-changing request from another origin is rejected (CSRF)", async () => {
    // A classic cross-origin form post riding on the victim's session cookie.
    const response = await fetch(`${app.baseUrl}/api/auth/sign-out`, {
      body: "",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: alice.cookie,
        origin: "https://evil.test",
      },
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: "csrf/untrusted-origin",
      message: "Untrusted origin",
    });
    expect((await alice.api.me.get()).status).toBe(200);
  });

  test("safe methods pass the guard (the browser still cannot read them: no CORS headers)", async () => {
    const response = await fetch(`${app.baseUrl}/api/me`, {
      headers: { cookie: alice.cookie, origin: "https://evil.test" },
    });

    expect(response.status).toBe(200);
  });
});

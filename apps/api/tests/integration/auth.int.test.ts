import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { startTestApp, type TestApp } from "./test-app.ts";

describe("auth", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  beforeEach(async () => {
    await app.truncate();
  });
  afterAll(async () => {
    await app.stop();
  });

  test("sign-up sets an HttpOnly, SameSite=Lax session cookie", async () => {
    const response = await app.fetchAuth("/sign-up/email", {
      email: "alice@mail.test",
      name: "Alice",
      password: "correct horse battery staple",
    });

    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .find((header) => header.includes("session_token"));
    expect(cookie).toBeDefined();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  test("protected routes return 401 without a session", async () => {
    const { error } = await app.anonymous.me.get();

    expect(error?.status).toBe(401);
    expect(error?.value).toEqual({ code: "auth/unauthorized", message: "Sign in required" });
  });

  test("a signed-in user can call protected routes; sign-out revokes the session", async () => {
    const alice = await app.signUp("Alice");
    expect((await alice.api.me.get()).data).toMatchObject({ id: alice.id, name: "Alice" });

    const signOut = await app.fetchAuth("/sign-out", {}, alice.cookie);
    expect(signOut.status).toBe(200);

    // The same cookie is now useless: sessions live in the database and are revocable.
    expect((await alice.api.me.get()).status).toBe(401);
  });

  test("sign-in with a wrong password is rejected", async () => {
    await app.fetchAuth("/sign-up/email", {
      email: "bob@mail.test",
      name: "Bob",
      password: "correct horse battery staple",
    });

    const response = await app.fetchAuth("/sign-in/email", {
      email: "bob@mail.test",
      password: "wrong password!",
    });

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  test("a duplicate email cannot sign up twice", async () => {
    const credentials = {
      email: "dup@mail.test",
      name: "Dup",
      password: "correct horse battery staple",
    };
    expect((await app.fetchAuth("/sign-up/email", credentials)).status).toBe(200);

    const second = await app.fetchAuth("/sign-up/email", credentials);

    expect(second.status).toBe(422);
  });
});

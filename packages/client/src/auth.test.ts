import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client.ts";
import { type Auth, createAuth } from "./auth.ts";
import { createFakeFetch, fakeMe, type FakeRoute, fakeUser, problem } from "./fake-fetch.fake.ts";
import { createMemorySessionStore, type SessionStore } from "./session.ts";

const setup = async (
  routes: Readonly<Record<string, FakeRoute>>,
  initialToken: null | string = null,
): Promise<{
  readonly auth: Auth;
  readonly calls: ReturnType<typeof createFakeFetch>["calls"];
  readonly session: SessionStore;
}> => {
  const session = createMemorySessionStore();
  if (initialToken !== null) {
    await session.set(initialToken);
  }
  const fake = createFakeFetch(routes);
  const api = createApiClient({
    baseUrl: "https://api.test",
    fetch: fake.fetch,
    token: () => auth.token(),
  });
  const auth = createAuth({ api, session });
  await auth.ready;
  return { auth, calls: fake.calls, session };
};

describe("createAuth session", () => {
  it("loads the stored token at startup and exposes it synchronously", async () => {
    const { auth } = await setup({}, "stored");
    expect(auth.token()).toBe("stored");
    expect(auth.store.getState()).toEqual({ status: "signed-in", user: null });
  });

  it("is signed out without a stored token", async () => {
    const { auth } = await setup({});
    expect(auth.token()).toBeUndefined();
    expect(auth.store.getState()).toEqual({ status: "signed-out", user: null });
  });

  it("me() returns the user and signs out on 401", async () => {
    const { auth, session } = await setup(
      { "GET /api/me": () => problem(401, "auth/unauthorized") },
      "stale",
    );
    await expect(auth.me()).resolves.toEqual({ error: "auth/unauthorized", ok: false });
    expect(auth.token()).toBeUndefined();
    await expect(session.get()).resolves.toBeNull();
    expect(auth.store.getState().status).toBe("signed-out");
  });

  it("me() caches the user", async () => {
    const { auth } = await setup({ "GET /api/me": () => fakeMe }, "ok");
    await expect(auth.me()).resolves.toEqual({ ok: true, value: fakeUser });
    expect(auth.store.getState()).toEqual({ status: "signed-in", user: fakeUser });
  });
});

describe("createAuth login", () => {
  it("loginWithDev stores the token", async () => {
    const { auth, calls, session } = await setup({
      "POST /api/auth/dev": () => ({ token: "dev-token", user: fakeUser }),
    });
    await expect(auth.loginWithDev("1")).resolves.toEqual({ ok: true, value: fakeUser });
    expect(calls[0]?.body).toEqual({ telegramId: "1" });
    expect(auth.token()).toBe("dev-token");
    await expect(session.get()).resolves.toBe("dev-token");
    expect(auth.store.getState()).toEqual({ status: "signed-in", user: fakeUser });
  });

  it("loginWithTelegram maps API failures to their code and transport failures to network", async () => {
    const widget = { auth_date: 1, first_name: "Ann", hash: "h", id: 1 };
    const denied = await setup({
      "POST /api/auth/telegram": () => problem(403, "auth/not-allowed"),
    });
    await expect(denied.auth.loginWithTelegram(widget)).resolves.toEqual({
      error: "auth/not-allowed",
      ok: false,
    });
    const offline = await setup({
      "POST /api/auth/telegram": () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(offline.auth.loginWithTelegram(widget)).resolves.toEqual({
      error: "network",
      ok: false,
    });
    const granted = await setup({
      "POST /api/auth/telegram": () => ({ token: "w", user: fakeUser }),
    });
    await expect(granted.auth.loginWithTelegram(widget)).resolves.toEqual({
      ok: true,
      value: fakeUser,
    });
    expect(granted.auth.token()).toBe("w");
  });
});

const NONCE_CREATED = {
  deepLink: "https://t.me/PaceTaskTrackerBot?start=login_n1",
  nonce: "n1",
};

const nonceRoute: FakeRoute = () => NONCE_CREATED;

describe("createAuth bot login", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tells the server where the login started, so the bot's button leads back there", async () => {
    const asked: (null | string)[] = [];
    const { auth } = await setup({
      "POST /api/auth/nonce": ({ url }) => {
        asked.push(url.searchParams.get("from"));
        return NONCE_CREATED;
      },
    });
    await auth.startBotLogin("web");
    await auth.startBotLogin("app");
    expect(asked).toEqual(["web", "app"]);
  });

  it("polls until the nonce is ready and stores the token", async () => {
    vi.useFakeTimers();
    let polls = 0;
    const { auth, session } = await setup({
      "GET /api/auth/nonce/n1": () => {
        polls += 1;
        return polls < 3
          ? { status: "pending" }
          : { status: "ready", token: "bot", user: fakeUser };
      },
      "POST /api/auth/nonce": nonceRoute,
    });
    const login = await auth.startBotLogin("app");
    expect(login.nonce).toBe("n1");
    expect(login.deepLink).toContain("login_n1");
    const waiting = login.waitForToken({ intervalMs: 100, timeoutMs: 10_000 });
    await vi.advanceTimersByTimeAsync(250);
    await expect(waiting).resolves.toEqual({ ok: true, value: fakeUser });
    expect(polls).toBe(3);
    expect(auth.token()).toBe("bot");
    await expect(session.get()).resolves.toBe("bot");
  });

  it("resumes polling a nonce after the login page recreates its auth client", async () => {
    const first = await setup({ "POST /api/auth/nonce": nonceRoute });
    const nonce = (await first.auth.startBotLogin("web")).nonce;
    const restored = await setup({
      "GET /api/auth/nonce/n1": () => ({ status: "ready", token: "bot", user: fakeUser }),
    });
    const result = await restored.auth.resumeBotLogin(nonce).waitForToken({
      intervalMs: 10,
      timeoutMs: 1000,
    });
    expect(result).toEqual({ ok: true, value: fakeUser });
    expect(restored.auth.token()).toBe("bot");
  });

  it("gives up on not-allowed, timeout and cancellation", async () => {
    vi.useFakeTimers();
    const denied = await setup({
      "GET /api/auth/nonce/n1": () => problem(403, "auth/not-allowed"),
      "POST /api/auth/nonce": nonceRoute,
    });
    const deniedLogin = await denied.auth.startBotLogin("app");
    await expect(deniedLogin.waitForToken({ intervalMs: 10, timeoutMs: 100 })).resolves.toEqual({
      error: "not-allowed",
      ok: false,
    });

    const pending = await setup({
      "GET /api/auth/nonce/n1": () => ({ status: "pending" }),
      "POST /api/auth/nonce": nonceRoute,
    });
    const timing = (await pending.auth.startBotLogin("app")).waitForToken({
      intervalMs: 10,
      timeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(150);
    await expect(timing).resolves.toEqual({ error: "timeout", ok: false });

    const controller = new AbortController();
    const cancelling = (await pending.auth.startBotLogin("app")).waitForToken({
      intervalMs: 10,
      signal: controller.signal,
      timeoutMs: 10_000,
    });
    await vi.advanceTimersByTimeAsync(25);
    controller.abort();
    await expect(cancelling).resolves.toEqual({ error: "cancelled", ok: false });
    expect(pending.auth.token()).toBeUndefined();
  });

  it("keeps polling through transient failures and treats a gone nonce as a timeout", async () => {
    vi.useFakeTimers();
    let polls = 0;
    const { auth } = await setup({
      "GET /api/auth/nonce/n1": () => {
        polls += 1;
        return polls === 1 ? problem(503, "unavailable") : problem(404, "auth/nonce-expired");
      },
      "POST /api/auth/nonce": nonceRoute,
    });
    const waiting = (await auth.startBotLogin("app")).waitForToken({
      intervalMs: 10,
      timeoutMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(50);
    await expect(waiting).resolves.toEqual({ error: "timeout", ok: false });
    expect(polls).toBe(2);
  });
});

describe("createAuth logout", () => {
  it("calls the API and clears the session even when the call fails", async () => {
    const { auth, calls, session } = await setup(
      { "POST /api/auth/logout": () => problem(500, "boom") },
      "stored",
    );
    await auth.logout();
    expect(calls.map((call) => call.path)).toEqual(["/api/auth/logout"]);
    expect(auth.token()).toBeUndefined();
    await expect(session.get()).resolves.toBeNull();
    expect(auth.store.getState()).toEqual({ status: "signed-out", user: null });
  });
});

describe("createAuth account confirmation", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  it("requests Telegram confirmation and polls after the session is gone", async () => {
    const { auth, calls, session } = await setup(
      {
        "POST /api/account/confirmations": () => ({ id, expiresAt: "2026-10-16T12:05:00.000Z" }),
        [`GET /api/account/confirmations/${id}`]: () => ({ status: "confirmed" }),
      },
      "stored",
    );
    await expect(auth.requestAccountConfirmation("delete")).resolves.toEqual({
      ok: true,
      value: { id, expiresAt: "2026-10-16T12:05:00.000Z" },
    });
    expect(auth.token()).toBe("stored");
    await auth.finishAccountDeletion();
    await expect(auth.accountConfirmationStatus(id)).resolves.toEqual({
      ok: true,
      value: "confirmed",
    });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /api/account/confirmations",
      `GET /api/account/confirmations/${id}`,
    ]);
    await expect(session.get()).resolves.toBeNull();
    expect(auth.store.getState()).toEqual({ status: "signed-out", user: null });
  });

  it("keeps the device signed in when a request could not be sent", async () => {
    const { auth } = await setup(
      { "POST /api/account/confirmations": () => problem(500, "boom") },
      "stored",
    );
    await expect(auth.requestAccountConfirmation("wipe")).resolves.toEqual({
      error: "boom",
      ok: false,
    });
    expect(auth.token()).toBe("stored");
  });
});

describe("adoptToken", () => {
  it("stores a token minted elsewhere and loads the user behind it", async () => {
    const { auth, calls, session } = await setup({ "GET /api/me": () => fakeMe });
    await expect(auth.adoptToken("tok_web")).resolves.toEqual({ ok: true, value: fakeUser });
    expect(auth.token()).toBe("tok_web");
    await expect(session.get()).resolves.toBe("tok_web");
    expect(auth.store.getState()).toEqual({ status: "signed-in", user: fakeUser });
    expect(calls.map((call) => call.path)).toEqual(["/api/me"]);
  });

  it("leaves the device signed out when the server rejects the token", async () => {
    const { auth, session } = await setup({ "GET /api/me": () => problem(401, "auth/invalid") });
    await expect(auth.adoptToken("tok_bad")).resolves.toEqual({ error: "auth/invalid", ok: false });
    expect(auth.token()).toBeUndefined();
    await expect(session.get()).resolves.toBeNull();
    expect(auth.store.getState()).toEqual({ status: "signed-out", user: null });
  });

  it("drops the token again when the user cannot be loaded", async () => {
    const { auth, session } = await setup({
      "GET /api/me": () => {
        throw new TypeError("offline");
      },
    });
    await expect(auth.adoptToken("tok_offline")).resolves.toEqual({ error: "network", ok: false });
    expect(auth.token()).toBeUndefined();
    await expect(session.get()).resolves.toBeNull();
    expect(auth.store.getState().status).toBe("signed-out");
  });
});

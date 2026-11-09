import { afterEach, describe, expect, it, vi } from "vitest";

import { endpoints } from "@pace/core";

import { createApiClient } from "./api-client.ts";
import { type Auth, createAuth } from "./auth.ts";
import { createFakeFetch, fakeMe, type FakeRoute, fakeUser, problem } from "./fake-fetch.fake.ts";
import {
  createMemorySessionStore,
  createMemorySignOutNotes,
  type SessionStore,
  type SignOutNotes,
} from "./session.ts";

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
    // Wired as `createPaceClient` wires it.
    sessionEnded: () => auth.hasEnded(),
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
    // The login card says why (QA round 15 L2): the session was ended elsewhere or expired.
    expect(auth.store.getState().endedElsewhere).toBe(true);
  });

  it("forgets the next login's reason: a new session starts with nothing to explain", async () => {
    const { auth } = await setup(
      {
        "GET /api/me": () => problem(401, "auth/unauthorized"),
        "POST /api/auth/dev": () => ({ token: "fresh", user: fakeUser }),
      },
      "stale",
    );
    await auth.me();
    await auth.loginWithDev("1001");
    expect(auth.store.getState().endedElsewhere).toBeUndefined();
  });

  it("a 401 answering a session this device already forgot changes nothing (fix round 1)", async () => {
    // The device ended its own session: the server closed its socket, the socket asked `me`, and
    // the 401 came back after `forget()`. The person did it here: no "ended elsewhere".
    const held: { release?: () => void } = {};
    const gate = new Promise<void>((resolve) => {
      held.release = resolve;
    });
    const { auth } = await setup(
      {
        "GET /api/me": async () => {
          await gate;
          return problem(401, "auth/unauthorized");
        },
      },
      "stored",
    );
    const asked = auth.me();
    await auth.endThisDevice(async () => {
      await Promise.resolve();
    });
    held.release?.();
    await asked;
    expect(auth.store.getState()).toEqual({ status: "signed-out", user: null });
    expect(auth.store.getState().endedElsewhere).toBeUndefined();
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

  it("names the phone to the server, so the session it opens is called after it; the web names none", async () => {
    const { auth, calls } = await setup({ "POST /api/auth/nonce": () => NONCE_CREATED });
    await auth.startBotLogin("app", { deviceId: "dev-1", deviceName: "Pixel 9a" });
    await auth.startBotLogin("web");
    expect(calls.map((call) => call.body)).toEqual([
      { deviceId: "dev-1", deviceName: "Pixel 9a" },
      undefined,
    ]);
  });

  it("cuts what the phone says to the server's limits and drops blanks, so a long model cannot block the sign-in", async () => {
    const { auth, calls } = await setup({ "POST /api/auth/nonce": () => NONCE_CREATED });
    await auth.startBotLogin("app", {
      deviceBrand: " ".repeat(3),
      deviceId: "dev-1",
      deviceModel: `  ${"👨‍👩‍👧".repeat(100)}  `,
      deviceName: "x".repeat(200),
      osVersion: "1".repeat(50),
    });
    const body = calls[0]?.body as Record<string, string>;
    expect(body["deviceBrand"]).toBeUndefined();
    expect(body["deviceId"]).toBe("dev-1");
    // The server's `.max()` counts UTF-16 units: the cut must fit that, between two characters.
    expect(body["deviceModel"]?.length).toBeLessThanOrEqual(60);
    expect(body["deviceModel"]).toBe("👨‍👩‍👧".repeat(7));
    expect(body["deviceName"]).toBe("x".repeat(80));
    expect(body["osVersion"]).toBe("1".repeat(20));
    // What the server parses keeps every field (a field over its limit would be dropped).
    expect(endpoints.auth.nonceCreate.body.parse(body)).toEqual(body);
  });

  it("keeps an emoji model the server can store: within its UTF-16 limit, no half character (bug-lessons 186)", async () => {
    const { auth, calls } = await setup({ "POST /api/auth/nonce": () => NONCE_CREATED });
    await auth.startBotLogin("app", { deviceModel: `Pixel ${"🚀".repeat(40)}` });
    const body = calls[0]?.body as Record<string, string>;
    expect(endpoints.auth.nonceCreate.body.parse(body)).toEqual(body);
    expect(body["deviceModel"]).toBe(`Pixel ${"🚀".repeat(27)}`);
  });

  it("signs in against an older Worker that refuses the phone's newer fields: asks again with the old ones", async () => {
    let asked = 0;
    const { auth, calls } = await setup({
      "POST /api/auth/nonce": () => {
        asked += 1;
        const isKnown = Object.keys(calls.at(-1)?.body as object).every((key) =>
          ["deviceId", "deviceName"].includes(key),
        );
        return isKnown ? NONCE_CREATED : problem(422, "validation");
      },
    });
    const login = await auth.startBotLogin("app", {
      deviceId: "dev-1",
      deviceModel: "Pixel 9a",
      deviceName: "Pixel 9a",
    });
    expect(login.nonce).toBe("n1");
    expect(asked).toBe(2);
    expect(calls.at(-1)?.body).toEqual({ deviceId: "dev-1", deviceName: "Pixel 9a" });
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
  it("forgets a session the server already ended without asking it again (QA round 15 L2)", async () => {
    const { auth, calls, session } = await setup({}, "stored");
    await auth.endThisDevice(async () => {
      await Promise.resolve();
    });
    expect(calls).toEqual([]);
    expect(auth.token()).toBeUndefined();
    await expect(session.get()).resolves.toBeNull();
    expect(auth.store.getState()).toEqual({ status: "signed-out", user: null });
  });

  it("forgets the token before it tells the server: only the logout carries it, and the reason is the person's own (QA round 22 R22-02)", async () => {
    const seen: { token?: string | undefined; status?: string } = {};
    const held: { release?: () => void } = {};
    const { auth, calls, session } = await setup(
      {
        "GET /api/me": () => problem(401, "auth/unauthorized"),
        "POST /api/auth/logout": async () => {
          seen.token = auth.token();
          seen.status = auth.store.getState().status;
          await new Promise<void>((resolve) => {
            held.release = resolve;
          });
          return { ok: true };
        },
      },
      "stored",
    );
    const loggingOut = auth.logout();
    await vi.waitFor(() => {
      expect(held.release).toBeDefined();
    });
    // Signed out here before the server ends the session: the socket's 4401, a sync or a
    // session check set off meanwhile has no token to send and nothing to call "ended elsewhere".
    expect(seen).toEqual({ status: "signed-out", token: undefined });
    await expect(session.get()).resolves.toBeNull();
    await expect(auth.me()).resolves.toEqual({ error: "auth/unauthorized", ok: false });
    held.release?.();
    await loggingOut;
    expect(calls.map((call) => [call.path, call.headers["authorization"]])).toEqual([
      ["/api/auth/logout", "Bearer stored"],
    ]);
    expect(auth.store.getState()).toEqual({ status: "signed-out", user: null });
  });

  it("a session check answered after the logout leaves the device signed out (fix round 1 of QA 22)", async () => {
    const held: { release?: () => void } = {};
    const { auth, session } = await setup(
      {
        "GET /api/me": async () => {
          await new Promise<void>((resolve) => {
            held.release = resolve;
          });
          return fakeMe;
        },
        "POST /api/auth/logout": () => ({ ok: true }),
      },
      "stored",
    );
    const checking = auth.me();
    await vi.waitFor(() => {
      expect(held.release).toBeDefined();
    });
    await auth.logout();
    held.release?.();
    // The answer was for the token the person just signed out of: it writes nothing.
    await expect(checking).resolves.toEqual({ error: "session/changed", ok: false });
    expect(auth.token()).toBeUndefined();
    await expect(session.get()).resolves.toBeNull();
    expect(auth.store.getState()).toEqual({ status: "signed-out", user: null });
    expect(auth.hasEnded()).toBe(true);
  });

  it("a new session after a sign-out is a session again: login and an adopted token (fix round 1 of QA 22)", async () => {
    const { auth } = await setup(
      {
        "GET /api/me": () => fakeMe,
        "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
        "POST /api/auth/logout": () => ({ ok: true }),
      },
      "stored",
    );
    expect(auth.hasEnded()).toBe(false);
    await auth.logout();
    expect(auth.hasEnded()).toBe(true);
    await auth.loginWithDev("1");
    expect(auth.hasEnded()).toBe(false);
    await auth.logout();
    expect(auth.hasEnded()).toBe(true);
    await auth.adoptToken("tok_web");
    expect(auth.hasEnded()).toBe(false);
  });

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

  it("an answer for a token the device dropped meanwhile changes nothing (fix round 1 of QA 22)", async () => {
    const held: { release?: () => void } = {};
    const { auth, session } = await setup({
      "GET /api/me": async () => {
        await new Promise<void>((resolve) => {
          held.release = resolve;
        });
        return fakeMe;
      },
      "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
      "POST /api/auth/logout": () => ({ ok: true }),
    });
    const adopting = auth.adoptToken("tok_web");
    await vi.waitFor(() => {
      expect(held.release).toBeDefined();
    });
    // Another login takes the device's place while the adopted token's check is on its way.
    await auth.loginWithDev("1");
    held.release?.();
    await expect(adopting).resolves.toEqual({ error: "session/changed", ok: false });
    // The newer session stays: neither the late answer nor its failure touched it.
    expect(auth.token()).toBe("tok_dev");
    await expect(session.get()).resolves.toBe("tok_dev");
    expect(auth.store.getState().status).toBe("signed-in");
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

/** One tab of a browser profile: its own auth on the profile's shared session store and note. */
const browserTab = (
  routes: Readonly<Record<string, FakeRoute>>,
  profile: { readonly notes: SignOutNotes; readonly session: SessionStore },
): Auth => {
  const api = createApiClient({
    baseUrl: "https://api.test",
    fetch: createFakeFetch(routes).fetch,
    token: () => auth.token(),
  });
  const auth = createAuth({ api, ...profile });
  return auth;
};

/**
Two tabs of one browser profile: one shared session store and one shared sign-out note (the
profile's localStorage), each tab with its own auth holding the token in memory. `revoked`: the
server no longer knows the token (every `me` answers 401 once it is set).
*/
const twoTabs = async (
  options: { readonly session?: SessionStore; readonly notes?: SignOutNotes } = {},
) => {
  const session = options.session ?? createMemorySessionStore();
  const notes = options.notes ?? createMemorySignOutNotes();
  const server = { revoked: false };
  const held: { release?: () => void } = {};
  const logoutGate = new Promise<void>((resolve) => {
    held.release = resolve;
  });
  const routes: Readonly<Record<string, FakeRoute>> = {
    "GET /api/me": () => (server.revoked ? problem(401, "auth/unauthorized") : fakeMe),
    // The server ends the session at once; its answer is held until the test releases it.
    "POST /api/auth/logout": async () => {
      server.revoked = true;
      await logoutGate;
      return { ok: true };
    },
  };
  await session.set("shared");
  const first = browserTab(routes, { notes, session });
  const second = browserTab(routes, { notes, session });
  await Promise.all([first.ready, second.ready]);
  return {
    first,
    releaseLogout: () => held.release?.(),
    second,
    server,
  };
};

describe('createAuth: "another tab" only on a log-out in another tab (QA 18 L3, fix round 5 V1)', () => {
  it("says another tab for a log-out in another tab, even while that log-out's answer is on its way", async () => {
    const { first, releaseLogout, second, server } = await twoTabs();
    // The second tab logs out; the server ends the session before its answer comes back, and the
    // first tab's socket closes and asks `me` meanwhile (CI run 41400987398).
    const leaving = second.logout();
    await vi.waitFor(() => {
      expect(server.revoked).toBe(true);
    });
    await first.me();
    expect(first.store.getState()).toEqual({
      endedInAnotherTab: true,
      status: "signed-out",
      user: null,
    });
    releaseLogout();
    await leaving;
    expect(second.store.getState()).toEqual({ status: "signed-out", user: null });
  });

  it("says another tab when another tab ended this browser's own session from its device list", async () => {
    const { first, second, server } = await twoTabs();
    // Settings → Devices → this browser's row: the server ended it, then the tab forgets it.
    await second.endThisDevice(async () => {
      server.revoked = true;
      await Promise.resolve();
    });
    await first.me();
    expect(first.store.getState().endedInAnotherTab).toBe(true);
  });

  it("says another tab when another tab finished deleting the account (round 6 M2)", async () => {
    const { first, second, server } = await twoTabs();
    // Confirmed in Telegram: the server dropped the account's sessions, the tab signs out.
    server.revoked = true;
    await second.finishAccountDeletion();
    await first.me();
    expect(first.store.getState().endedInAnotherTab).toBe(true);
  });

  it("leaves the note before this browser's own session is ended from its device list (round 6 M1)", async () => {
    const { first, second, server } = await twoTabs();
    // The other tab hears the 401 while the revoke is still on its way back.
    await second.endThisDevice(async () => {
      server.revoked = true;
      await first.me();
    });
    expect(first.store.getState().endedInAnotherTab).toBe(true);
    expect(second.store.getState()).toEqual({ status: "signed-out", user: null });
  });

  it("a 401 the ending tab hears for the session it is ending signs it out as its own act", async () => {
    const { second, server } = await twoTabs();
    await second.endThisDevice(async () => {
      server.revoked = true;
      await second.me();
      // Its own check never takes the token away before the revoke has answered.
      expect(second.store.getState().status).toBe("signed-in");
    });
    expect(second.store.getState()).toEqual({ status: "signed-out", user: null });
  });

  it("says it is ending its own session only while the revoke is on its way", async () => {
    const { second, server } = await twoTabs();
    const during = { isEnding: false };
    expect(second.isEnding()).toBe(false);
    await second.endThisDevice(async () => {
      during.isEnding = second.isEnding();
      server.revoked = true;
      await Promise.resolve();
    });
    expect(during.isEnding).toBe(true);
    expect(second.isEnding()).toBe(false);
  });

  it("a revoke that fails keeps the session and takes the note back", async () => {
    const { first, second, server } = await twoTabs();
    await expect(
      second.endThisDevice(async () => {
        await Promise.reject(new Error("network"));
      }),
    ).rejects.toThrow("network");
    expect(second.store.getState().status).toBe("signed-in");
    expect(second.token()).toBe("shared");
    // Ended later from another device: nobody here said it was this browser.
    server.revoked = true;
    await first.me();
    expect(first.store.getState().endedElsewhere).toBe(true);
  });

  it("says another device to both tabs when the session was ended from another device", async () => {
    const { first, second, server } = await twoTabs();
    server.revoked = true;
    // The second tab hears first and forgets the session in the shared store.
    await second.me();
    await first.me();
    for (const tab of [first, second]) {
      expect(tab.store.getState()).toEqual({
        endedElsewhere: true,
        status: "signed-out",
        user: null,
      });
    }
  });

  it("says another device where the browser keeps nothing (blocked storage)", async () => {
    const blocked: SessionStore = {
      clear: async () => {
        await Promise.resolve();
      },
      get: async () => null,
      set: async () => {
        await Promise.resolve();
      },
    };
    const notes: SignOutNotes = {
      leave: async () => {
        await Promise.resolve();
      },
      read: async () => null,
      withdraw: async () => {
        await Promise.resolve();
      },
    };
    const { first, server } = await twoTabs({ notes, session: blocked });
    await first.adoptToken("in-memory");
    server.revoked = true;
    await first.me();
    expect(first.store.getState().endedElsewhere).toBe(true);
    expect(first.store.getState().endedInAnotherTab).toBeUndefined();
  });

  it("says another device, and does not throw, when the device's stores fail to read (V9)", async () => {
    // A keystore that answers at startup and fails afterwards (SecureStore read errors).
    const memory = createMemorySessionStore();
    const failing = { isBroken: false };
    const session: SessionStore = {
      clear: async () => {
        if (failing.isBroken) {
          throw new Error("keystore");
        }
        await memory.clear();
      },
      get: async () => {
        if (failing.isBroken) {
          throw new Error("keystore");
        }
        return await memory.get();
      },
      set: memory.set,
    };
    const notes: SignOutNotes = {
      leave: async () => {
        await Promise.reject(new Error("keystore"));
      },
      read: async () => {
        throw new Error("keystore");
      },
      withdraw: async () => {
        await Promise.reject(new Error("keystore"));
      },
    };
    const { first, server } = await twoTabs({ notes, session });
    failing.isBroken = true;
    server.revoked = true;
    await expect(first.me()).resolves.toEqual({ error: "auth/unauthorized", ok: false });
    expect(first.token()).toBeUndefined();
    expect(first.store.getState()).toEqual({
      endedElsewhere: true,
      status: "signed-out",
      user: null,
    });
  });

  it("logs out even when the note cannot be left", async () => {
    const notes: SignOutNotes = {
      leave: async () => {
        await Promise.reject(new Error("keystore"));
      },
      read: async () => null,
      withdraw: async () => {
        await Promise.resolve();
      },
    };
    const { releaseLogout, second } = await twoTabs({ notes });
    releaseLogout();
    await second.logout();
    expect(second.store.getState()).toEqual({ status: "signed-out", user: null });
  });

  it("keeps no token in the note, only a mark of it", async () => {
    const notes = createMemorySignOutNotes();
    const { releaseLogout, second } = await twoTabs({ notes });
    releaseLogout();
    await second.logout();
    const note = await notes.read();
    expect(note).not.toBeNull();
    expect(note).not.toContain("shared");
  });
});

/**
Two tabs on one shared session store. The first tab still holds `old` in memory, which the server
no longer knows; the second logs out and signs in again (`newer`), maybe as another account.
*/
const staleAndFresh = async () => {
  const profile = { notes: createMemorySignOutNotes(), session: createMemorySessionStore() };
  await profile.session.set("old");
  const stale = browserTab({ "GET /api/me": () => problem(401, "auth/unauthorized") }, profile);
  const fresh = browserTab(
    {
      "GET /api/me": () => fakeMe,
      "POST /api/auth/dev": () => ({ token: "newer", user: fakeUser }),
      "POST /api/auth/logout": () => ({ ok: true }),
    },
    profile,
  );
  await Promise.all([stale.ready, fresh.ready]);
  await fresh.logout();
  await fresh.loginWithDev("2");
  return { fresh, session: profile.session, stale };
};

describe("createAuth: a stale tab never ends another tab's newer session (round 6 I1)", () => {
  it("a late 401 for the old session leaves the newer one in the shared store", async () => {
    const { fresh, session, stale } = await staleAndFresh();
    await stale.me();
    expect(stale.store.getState().status).toBe("signed-out");
    await expect(session.get()).resolves.toBe("newer");
    expect(fresh.token()).toBe("newer");
  });

  it("tells the stale tab that the store holds another session, so it keeps the local copy", async () => {
    const { stale } = await staleAndFresh();
    await stale.me();
    await expect(stale.isSessionStored()).resolves.toBe(true);
  });

  it("a sign-out of the session the store holds clears it, and says nothing is stored", async () => {
    const { fresh, session } = await staleAndFresh();
    await fresh.logout();
    await expect(session.get()).resolves.toBeNull();
    await expect(fresh.isSessionStored()).resolves.toBe(false);
  });
});

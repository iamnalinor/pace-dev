import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client.ts";
import { type Auth, createAuth } from "./auth.ts";
import { createFakeFetch, fakeMe, type FakeRoute, fakeUser, problem } from "./fake-fetch.fake.ts";
import {
  createMemoryEndedSessionStore,
  createMemorySessionStore,
  type EndedSessionStore,
  type SessionStore,
} from "./session.ts";

/**
One start of the device on the stores it keeps between starts: `ended` is where the sessions this
device signed out of wait for the server to end them (QA round 22 R22-02, the server half).
*/
const start = async (
  routes: Record<string, FakeRoute>,
  stores: { readonly ended: EndedSessionStore; readonly session: SessionStore },
): Promise<{
  readonly auth: Auth;
  readonly calls: ReturnType<typeof createFakeFetch>["calls"];
}> => {
  const fake = createFakeFetch(routes);
  const api = createApiClient({
    baseUrl: "https://api.test",
    fetch: fake.fetch,
    sessionEnded: () => auth.hasEnded(),
    token: () => auth.token(),
  });
  const auth = createAuth({ api, ended: stores.ended, session: stores.session });
  await auth.ready;
  return { auth, calls: fake.calls };
};

const offline = (): never => {
  throw new TypeError("Failed to fetch");
};

const signedInStores = async (): Promise<{
  readonly ended: EndedSessionStore;
  readonly session: SessionStore;
}> => {
  const session = createMemorySessionStore();
  await session.set("stored");
  return { ended: createMemoryEndedSessionStore(), session };
};

const logoutsOf = (calls: ReturnType<typeof createFakeFetch>["calls"]): (string | undefined)[] =>
  calls
    .filter((call) => call.path === "/api/auth/logout")
    .map((call) => call.headers["authorization"]);

describe("createAuth: a Log out the server did not hear is kept until it does (R22-02)", () => {
  it("keeps the ended session to revoke when the server cannot be reached, and says so", async () => {
    const stores = await signedInStores();
    const { auth } = await start({ "POST /api/auth/logout": offline }, stores);
    await auth.logout();
    expect(auth.token()).toBeUndefined();
    expect(auth.store.getState().status).toBe("signed-out");
    await expect(stores.ended.list()).resolves.toEqual(["stored"]);
    expect(auth.endedSessions.getState()).toEqual({ pending: true });
  });

  it("a logout the server answers keeps nothing", async () => {
    const stores = await signedInStores();
    const { auth } = await start({ "POST /api/auth/logout": () => ({ ok: true }) }, stores);
    await auth.logout();
    await expect(stores.ended.list()).resolves.toEqual([]);
    expect(auth.endedSessions.getState()).toEqual({ pending: false });
  });

  it("a retry ends it once the server answers, then the network goes quiet", async () => {
    const stores = await signedInStores();
    const network = { up: false };
    const { auth, calls } = await start(
      { "POST /api/auth/logout": () => (network.up ? { ok: true } : offline()) },
      stores,
    );
    await auth.logout();
    network.up = true;
    await auth.retryEndedSessions();
    await auth.retryEndedSessions();
    expect(logoutsOf(calls)).toEqual(["Bearer stored", "Bearer stored"]);
    await expect(stores.ended.list()).resolves.toEqual([]);
    expect(auth.endedSessions.getState()).toEqual({ pending: false });
  });

  it("a server that no longer knows the session (401) settles it too", async () => {
    const stores = await signedInStores();
    const network = { up: false };
    const { auth, calls } = await start(
      {
        "POST /api/auth/logout": () => (network.up ? problem(401, "auth/unauthorized") : offline()),
      },
      stores,
    );
    await auth.logout();
    network.up = true;
    await auth.retryEndedSessions();
    await auth.retryEndedSessions();
    expect(logoutsOf(calls)).toHaveLength(2);
    await expect(stores.ended.list()).resolves.toEqual([]);
  });

  it("a server error keeps it for the next try", async () => {
    const stores = await signedInStores();
    const { auth } = await start({ "POST /api/auth/logout": () => problem(503, "down") }, stores);
    await auth.logout();
    await auth.retryEndedSessions();
    await expect(stores.ended.list()).resolves.toEqual(["stored"]);
    expect(auth.endedSessions.getState()).toEqual({ pending: true });
  });

  it.each([
    [403, "forbidden"],
    [404, "not_found"],
    [407, "proxy"],
    [400, "bad_request"],
  ])(
    "a %i that is not the server's own answer (a proxy, a captive portal) keeps it",
    async (status, code) => {
      const stores = await signedInStores();
      const { auth } = await start(
        { "POST /api/auth/logout": () => problem(status, code) },
        stores,
      );
      await auth.logout();
      await auth.retryEndedSessions();
      await expect(stores.ended.list()).resolves.toEqual(["stored"]);
      expect(auth.endedSessions.getState()).toEqual({ pending: true });
    },
  );

  it("two retries at once send one request for the session", async () => {
    const stores = await signedInStores();
    const held: { release?: () => void; up: boolean } = { up: false };
    const { auth, calls } = await start(
      {
        "POST /api/auth/logout": async () => {
          if (!held.up) {
            return offline();
          }
          await new Promise<void>((resolve) => {
            held.release = resolve;
          });
          return { ok: true };
        },
      },
      stores,
    );
    await auth.logout();
    held.up = true;
    const first = auth.retryEndedSessions();
    const second = auth.retryEndedSessions();
    await vi.waitFor(() => {
      expect(held.release).toBeDefined();
    });
    held.release?.();
    await Promise.all([first, second]);
    expect(logoutsOf(calls)).toHaveLength(2);
  });

  it("the next start ends it on its own, and the old token is sent with nothing else", async () => {
    const stores = await signedInStores();
    const first = await start({ "POST /api/auth/logout": offline }, stores);
    await first.auth.logout();
    const next = await start(
      {
        "GET /api/me": () => fakeMe,
        "POST /api/auth/dev": () => ({ token: "fresh", user: fakeUser }),
        "POST /api/auth/logout": () => ({ ok: true }),
      },
      stores,
    );
    await vi.waitFor(async () => {
      await expect(stores.ended.list()).resolves.toEqual([]);
    });
    await next.auth.loginWithDev("1001");
    await next.auth.me();
    expect(next.calls.map((call) => [call.path, call.headers["authorization"]])).toEqual([
      ["/api/auth/logout", "Bearer stored"],
      ["/api/auth/dev", undefined],
      ["/api/me", "Bearer fresh"],
    ]);
    expect(next.auth.endedSessions.getState()).toEqual({ pending: false });
  });

  it("a login that reaches the server ends a session still waiting", async () => {
    const stores = await signedInStores();
    const network = { up: false };
    const { auth, calls } = await start(
      {
        "POST /api/auth/dev": () => ({ token: "fresh", user: fakeUser }),
        "POST /api/auth/logout": () => (network.up ? { ok: true } : offline()),
      },
      stores,
    );
    await auth.logout();
    network.up = true;
    await auth.loginWithDev("1001");
    await vi.waitFor(() => {
      expect(auth.endedSessions.getState()).toEqual({ pending: false });
    });
    expect(logoutsOf(calls)).toEqual(["Bearer stored", "Bearer stored"]);
    expect(auth.token()).toBe("fresh");
  });

  it("a store that cannot be read or written still signs out and retries in memory", async () => {
    const session = createMemorySessionStore();
    await session.set("stored");
    const broken: EndedSessionStore = {
      add: async () => {
        await Promise.reject(new Error("blocked"));
      },
      list: async () => {
        throw new Error("blocked");
      },
      remove: async () => {
        await Promise.reject(new Error("blocked"));
      },
    };
    const network = { up: false };
    const { auth, calls } = await start(
      { "POST /api/auth/logout": () => (network.up ? { ok: true } : offline()) },
      { ended: broken, session },
    );
    await auth.logout();
    expect(auth.store.getState().status).toBe("signed-out");
    expect(auth.endedSessions.getState()).toEqual({ pending: true });
    network.up = true;
    await auth.retryEndedSessions();
    expect(auth.endedSessions.getState()).toEqual({ pending: false });
    expect(logoutsOf(calls)).toHaveLength(2);
  });
});

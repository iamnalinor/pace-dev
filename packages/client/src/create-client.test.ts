import { describe, expect, it, vi } from "vitest";

import { endpoints, LIVE_SESSION_ENDED, ParseResponseSchema } from "@pace/core";

import type { SocketLike } from "./live.ts";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { createPaceClient, type PaceClient } from "./create-client.ts";
import { REQUEST_DEADLINE_MS } from "./deadline.ts";
import {
  createFakeFetch,
  emptySyncRoutes,
  fakeMe,
  type FakeRoute,
  fakeUser,
  problem,
} from "./fake-fetch.fake.ts";
import { createHeldEventStore } from "./held-event-store.fake.ts";
import { storedEvents } from "./local-store.fake.ts";
import { createMemorySessionStore } from "./session.ts";

const setup = async (
  routes: Readonly<Record<string, FakeRoute>> = {},
  storedToken?: string,
  createSocket?: (url: string, protocols: readonly string[]) => SocketLike,
): Promise<{ readonly api: ReturnType<typeof createFakeFetch>; readonly client: PaceClient }> => {
  const session = createMemorySessionStore();
  if (storedToken !== undefined) {
    await session.set(storedToken);
  }
  const api = createFakeFetch({ ...emptySyncRoutes, "GET /api/me": () => fakeMe, ...routes });
  const client = createPaceClient({
    baseUrl: "https://api.test",
    ...(createSocket !== undefined && { createSocket }),
    deviceId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    fetch: api.fetch,
    now: () => "2026-10-06T12:00:00.000Z",
    session,
    source: "web",
    store: createMemoryEventStore(),
  });
  await client.auth.ready;
  await client.state.ready;
  return { api, client };
};

/** One socket the client opens; the test plays the server's close. */
const oneSocket = (): {
  readonly create: (url: string, protocols: readonly string[]) => SocketLike;
  readonly opened: () => number;
  readonly emit: (type: string, event: { readonly code?: number }) => void;
} => {
  type Listener = (event: { readonly code?: unknown; readonly data?: unknown }) => void;
  const listeners: { type: string; listener: Listener }[] = [];
  let opened = 0;
  return {
    create: () => {
      opened += 1;
      return {
        addEventListener: (type, listener) => {
          listeners.push({ listener, type });
        },
        close: () => undefined,
        send: () => undefined,
      };
    },
    emit: (type, event) => {
      for (const entry of listeners) {
        if (entry.type === type) {
          entry.listener(event);
        }
      }
    },
    opened: () => opened,
  };
};

/** A sign-in notice with this id. */
const notice = (id: string) => ({
  createdAt: "2026-10-06T11:00:00.000Z",
  id,
  kind: "login",
  // eslint-disable-next-line sonarjs/no-hardcoded-ip -- the address a sign-in notice shows
  payload: { country: "Germany", ip: "1.2.3.4", kind: "web", name: "Chrome", sessionId: "s" },
  readAt: null,
  resolution: null,
  resolvedAt: null,
});

describe("createPaceClient", () => {
  it("counts the changes that have not reached the server, for Log out to ask (QA round 23 R23-02)", async () => {
    const { client } = await setup({}, "tok");
    await expect(client.unsyncedCount()).resolves.toBe(0);
    await client.actions.setNightHours(true);
    await client.actions.setLanguage("ru");
    await expect(client.unsyncedCount()).resolves.toBe(2);
    await client.sync.syncNow();
    await expect(client.unsyncedCount()).resolves.toBe(0);
  });

  it("a stale tab's sign-out keeps the shared copy another tab claimed since (re-review N3)", async () => {
    // Two tabs of one browser profile: one store, each tab its own client.
    const store = createMemoryEventStore();
    const tab = async (token: string): Promise<PaceClient> => {
      const session = createMemorySessionStore();
      await session.set(token);
      const api = createFakeFetch({ ...emptySyncRoutes, "GET /api/me": () => fakeMe });
      const client = createPaceClient({
        baseUrl: "https://api.test",
        deviceId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        fetch: api.fetch,
        now: () => "2026-10-06T12:00:00.000Z",
        session,
        source: "web",
        store,
      });
      await client.auth.ready;
      await client.state.ready;
      return client;
    };
    const stale = await tab("tok_old");
    await stale.claimLocalCopy("tok_old");
    // The other tab logged out and in again before the stale tab heard: its copy, its change.
    const fresh = await tab("tok_new");
    await fresh.claimLocalCopy("tok_new");
    await fresh.actions.setLanguage("ru");
    await stale.dropLocalCopyOf("tok_old");
    await expect(store.listPending()).resolves.toHaveLength(1);
    // The copy's own session leaving drops it.
    await fresh.dropLocalCopyOf("tok_new");
    await expect(store.listPending()).resolves.toHaveLength(0);
    // A copy nobody claimed (made before owners) goes too.
    await fresh.actions.setNightHours(true);
    await stale.dropLocalCopyOf("tok_old");
    await expect(store.listPending()).resolves.toHaveLength(0);
  });

  it("a claim waits for the sign-out's clear queued before it (fix round 2 review M7)", async () => {
    const held = createHeldEventStore();
    const session = createMemorySessionStore();
    await session.set("tok_old");
    const api = createFakeFetch({ ...emptySyncRoutes, "GET /api/me": () => fakeMe });
    const client = createPaceClient({
      baseUrl: "https://api.test",
      deviceId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      fetch: api.fetch,
      now: () => "2026-10-06T12:00:00.000Z",
      session,
      source: "web",
      store: held.store,
    });
    await client.auth.ready;
    await client.state.ready;
    await client.claimLocalCopy("tok_old");
    // A write in flight holds the queue; the old session's clear waits behind it, then the next
    // sign-in of the same tab claims the copy at once.
    held.hold();
    const written = client.actions.setLanguage("ru");
    const dropped = client.dropLocalCopyOf("tok_old");
    const claimed = client.claimLocalCopy("tok_new");
    await vi.waitFor(() => {
      expect(held.writes).toHaveLength(1);
    });
    await held.writes[0]?.resolve();
    await Promise.all([written, dropped, claimed]);
    // The clear had its turn first (the copy was still the old session's): nothing stays.
    await expect(storedEvents(held.store)).resolves.toEqual([]);
    await expect(held.store.listPending()).resolves.toEqual([]);
  });

  it("signs out when the server closes the live socket because the session ended", async () => {
    const socket = oneSocket();
    const me = { isRevoked: false };
    const { client } = await setup(
      { "GET /api/me": () => (me.isRevoked ? problem(401, "auth/unauthorized") : fakeMe) },
      "tok",
      socket.create,
    );
    await expect.poll(() => client.auth.store.getState().user).not.toBeNull();
    client.live.start();
    expect(socket.opened()).toBe(1);
    socket.emit("open", {});
    me.isRevoked = true;
    socket.emit("close", { code: LIVE_SESSION_ENDED });
    await expect.poll(() => client.auth.store.getState().status).toBe("signed-out");
    expect(socket.opened()).toBe(1);
    client.live.stop();
  });

  it('a logout\'s own 4401 close checks nothing: no request after the logout, no "ended elsewhere" (QA round 22 R22-02)', async () => {
    const socket = oneSocket();
    const { api, client } = await setup(
      {
        "GET /api/me": () => fakeMe,
        "POST /api/auth/logout": () => {
          // The Worker closes the session's sockets before it answers (`deleteSession`).
          socket.emit("close", { code: LIVE_SESSION_ENDED });
          return { ok: true };
        },
      },
      "tok",
      socket.create,
    );
    await expect.poll(() => client.auth.store.getState().user).not.toBeNull();
    client.live.start();
    socket.emit("open", {});
    const before = api.calls.length;
    await client.auth.logout();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(api.calls.slice(before).map((call) => call.path)).toEqual(["/api/auth/logout"]);
    expect(client.auth.store.getState()).toEqual({ status: "signed-out", user: null });
    client.live.stop();
  });

  it("never shows the last account's notifications to the next one signed in on this device (class 372)", async () => {
    const { api, client } = await setup(
      {
        "GET /api/notifications": ({ headers }) => ({
          deliveries: {},
          items: [notice(headers["authorization"] === "Bearer tok-a" ? "a1" : "b1")],
          more: false,
        }),
        "POST /api/auth/dev": () => ({ token: "tok-b", user: fakeUser }),
        "POST /api/auth/logout": () => ({ ok: true }),
      },
      "tok-a",
    );
    await expect.poll(() => client.auth.store.getState().user).not.toBeNull();
    await client.notifications.refreshUnlessFresh();
    expect(client.notifications.store.getState().items.map((item) => item.id)).toEqual(["a1"]);
    await client.auth.logout();
    expect(client.notifications.store.getState()).toMatchObject({ items: [], status: "idle" });
    await client.auth.loginWithDev("2");
    await client.notifications.refreshUnlessFresh();
    expect(client.notifications.store.getState().items.map((item) => item.id)).toEqual(["b1"]);
    expect(api.pathsCalled("/api/notifications")).toHaveLength(2);
  });

  it("opens the live socket again when its close was not the end of the session", async () => {
    const socket = oneSocket();
    const { client } = await setup({}, "tok", socket.create);
    await expect.poll(() => client.auth.store.getState().user).not.toBeNull();
    client.live.start();
    socket.emit("open", {});
    socket.emit("close", { code: LIVE_SESSION_ENDED });
    await expect.poll(() => socket.opened()).toBe(2);
    expect(client.auth.store.getState().status).toBe("signed-in");
    client.live.stop();
  });

  it("signs out on any call's 401 for the session in use, when no socket heard the end (fix round 5 V1)", async () => {
    // A tab whose socket was not open when the session was revoked (hidden, still starting): its
    // reconnects are refused at the door, and only its HTTP calls hear the 401.
    const server = { isRevoked: false };
    const { api, client } = await setup(
      {
        "GET /api/me": () => (server.isRevoked ? problem(401, "auth/unauthorized") : fakeMe),
        "GET /api/sync/pull": () =>
          server.isRevoked
            ? problem(401, "auth/unauthorized")
            : { events: [], more: false, seq: 0, storeId: "store-test" },
      },
      "tok",
    );
    await expect.poll(() => client.auth.store.getState().user).not.toBeNull();
    server.isRevoked = true;
    await client.sync.syncNow();
    await expect.poll(() => client.auth.store.getState().status).toBe("signed-out");
    expect(client.auth.store.getState().endedElsewhere).toBe(true);
    // One check of the session for that 401, not one per call or a loop on `me`'s own 401.
    expect(api.pathsCalled("/api/me")).toHaveLength(2);
    await client.sync.syncNow();
    expect(api.pathsCalled("/api/me")).toHaveLength(2);
  });

  it.each(["dropped", "claimed by a newer session"] as const)(
    "a tab with no socket signs out when its session ended and the shared copy was %s in another tab (PR 55 CI, round 6 M6/I1)",
    async (copy) => {
      // Two tabs of one browser profile: one store, each tab its own client. The hidden tab has no
      // socket to hear the end; the other tab heard it first and took the copy with it.
      const store = createMemoryEventStore();
      const server = { isRevoked: false };
      const refusedWhenRevoked = (answer: object) => () =>
        server.isRevoked ? problem(401, "auth/unauthorized") : answer;
      const tab = async () => {
        const session = createMemorySessionStore();
        await session.set("tok_old");
        const api = createFakeFetch({
          ...emptySyncRoutes,
          "GET /api/me": refusedWhenRevoked(fakeMe),
          "GET /api/sync/pull": refusedWhenRevoked({
            events: [],
            more: false,
            seq: 0,
            storeId: "store-test",
          }),
        });
        const client = createPaceClient({
          baseUrl: "https://api.test",
          deviceId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          fetch: api.fetch,
          now: () => "2026-10-06T12:00:00.000Z",
          session,
          source: "web",
          store,
        });
        await client.auth.ready;
        await client.state.ready;
        return { api, client };
      };
      const hidden = await tab();
      await hidden.client.claimLocalCopy("tok_old");
      await expect(hidden.client.sync.syncNow()).resolves.toMatchObject({ ok: true });
      const other = await tab();
      server.isRevoked = true;
      await other.client.dropLocalCopyOf("tok_old");
      if (copy === "claimed by a newer session") {
        await other.client.claimLocalCopy("tok_new");
      }
      // The hidden tab's poll: its run refuses to touch a copy that is no longer its own, and
      // still finds out that its session ended.
      await hidden.client.sync.syncNow();
      await expect.poll(() => hidden.client.auth.store.getState().status).toBe("signed-out");
      expect(hidden.client.auth.store.getState().endedElsewhere).toBe(true);
      // Signed out, the network goes quiet: one check, no loop.
      const checks = hidden.api.pathsCalled("/api/me").length;
      await hidden.client.sync.syncNow();
      expect(hidden.api.pathsCalled("/api/me")).toHaveLength(checks);
    },
  );

  it.each(["a call's 401", "the socket's close"] as const)(
    "sends nothing more with the session while %s has it checked, and nothing once it ended (CI run 41668309388)",
    async (heardBy) => {
      // A tab still starting (its first sync refused) or one whose socket heard the end: its next
      // call (the bell's read) leaves while `me` is on its way and would carry the ended session.
      const socket = oneSocket();
      const server = { isRevoked: false };
      const checked = Promise.withResolvers<null>();
      const { api, client } = await setup(
        {
          "GET /api/me": async () => {
            if (!server.isRevoked) {
              return fakeMe;
            }
            await checked.promise;
            return problem(401, "auth/unauthorized");
          },
          "GET /api/notifications": () => ({ deliveries: {}, items: [], more: false }),
          "GET /api/sync/pull": () =>
            server.isRevoked
              ? problem(401, "auth/unauthorized")
              : { events: [], more: false, seq: 0, storeId: "store-test" },
        },
        "tok",
        socket.create,
      );
      await expect.poll(() => client.auth.store.getState().user).not.toBeNull();
      const checks = api.pathsCalled("/api/me").length;
      server.isRevoked = true;
      if (heardBy === "a call's 401") {
        await client.sync.syncNow();
      } else {
        client.live.start();
        socket.emit("open", {});
        socket.emit("close", { code: LIVE_SESSION_ENDED });
      }
      await expect.poll(() => api.pathsCalled("/api/me").length).toBe(checks + 1);
      const refreshed = client.notifications.refresh();
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      expect(api.pathsCalled("/api/notifications")).toEqual([]);
      checked.resolve(null);
      await refreshed;
      await expect.poll(() => client.auth.store.getState().status).toBe("signed-out");
      expect(client.auth.store.getState().endedElsewhere).toBe(true);
      // Refused here once the check says the session ended: never sent with it.
      expect(api.pathsCalled("/api/notifications")).toEqual([]);
      client.live.stop();
    },
  );

  it("a call made while a 401 has the session checked goes out once it proves alive (CI run 41668309388)", async () => {
    const pulls = { count: 0 };
    const checked = Promise.withResolvers<null>();
    const { api, client } = await setup(
      {
        "GET /api/me": async () => {
          if (pulls.count > 0) {
            await checked.promise;
          }
          return fakeMe;
        },
        "GET /api/notifications": () => ({ deliveries: {}, items: [], more: false }),
        // The server misjudges once: a 401 for a session that is still good.
        "GET /api/sync/pull": () => {
          pulls.count += 1;
          return pulls.count === 1
            ? problem(401, "auth/unauthorized")
            : { events: [], more: false, seq: 0, storeId: "store-test" };
        },
      },
      "tok",
    );
    await expect.poll(() => client.auth.store.getState().user).not.toBeNull();
    const checks = api.pathsCalled("/api/me").length;
    await client.sync.syncNow();
    await expect.poll(() => api.pathsCalled("/api/me").length).toBe(checks + 1);
    const refreshed = client.notifications.refresh();
    checked.resolve(null);
    await refreshed;
    expect(api.pathsCalled("/api/notifications")).toEqual(["/api/notifications"]);
    expect(api.calls.at(-1)?.headers["authorization"]).toBe("Bearer tok");
    expect(client.notifications.store.getState().status).toBe("ready");
    expect(client.auth.store.getState().status).toBe("signed-in");
  });

  it("a check whose `me` never answers gives up after the request deadline: nothing signed out, the held call goes once (CI fix review I1)", async () => {
    const pulls = { count: 0 };
    const { api, client } = await setup(
      {
        "GET /api/me": async () => {
          if (pulls.count > 0) {
            await new Promise<never>(() => undefined);
          }
          return fakeMe;
        },
        "GET /api/notifications": () => ({ deliveries: {}, items: [], more: false }),
        "GET /api/sync/pull": () => {
          pulls.count += 1;
          return problem(401, "auth/unauthorized");
        },
      },
      "tok",
    );
    await expect.poll(() => client.auth.store.getState().user).not.toBeNull();
    vi.useFakeTimers();
    try {
      const checks = api.pathsCalled("/api/me").length;
      const run = client.sync.syncNow();
      await vi.advanceTimersByTimeAsync(10);
      await run;
      expect(api.pathsCalled("/api/me")).toHaveLength(checks + 1);
      const refreshed = client.notifications.refresh();
      await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS - 20);
      expect(api.pathsCalled("/api/notifications")).toEqual([]);
      await vi.advanceTimersByTimeAsync(20);
      await refreshed;
      expect(api.pathsCalled("/api/notifications")).toEqual(["/api/notifications"]);
      expect(api.calls.at(-1)?.headers["authorization"]).toBe("Bearer tok");
      expect(client.auth.store.getState().status).toBe("signed-in");
    } finally {
      vi.useRealTimers();
    }
  });

  it("`me` and a log-out are never held behind the check under way (CI fix review m2)", async () => {
    const pulls = { count: 0 };
    const checked = Promise.withResolvers<null>();
    const { api, client } = await setup(
      {
        "GET /api/me": async () => {
          if (pulls.count > 0) {
            await checked.promise;
          }
          return fakeMe;
        },
        "GET /api/sync/pull": () => {
          pulls.count += 1;
          return problem(401, "auth/unauthorized");
        },
        "POST /api/auth/logout": () => ({ ok: true }),
      },
      "tok",
    );
    await expect.poll(() => client.auth.store.getState().user).not.toBeNull();
    const checks = api.pathsCalled("/api/me").length;
    await client.sync.syncNow();
    expect(api.pathsCalled("/api/me")).toHaveLength(checks + 1);
    const asked = client.api.call(endpoints.me, {});
    const ended = client.api.call(endpoints.auth.logout, {});
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(api.pathsCalled("/api/me")).toHaveLength(checks + 2);
    expect(api.pathsCalled("/api/auth/logout")).toEqual(["/api/auth/logout"]);
    checked.resolve(null);
    await Promise.all([asked, ended]);
  });

  it("the start's `me` is the check: it holds nothing alone, and a 401 meanwhile joins it, asks nothing more and holds what follows (CI fix review m3)", async () => {
    const started = Promise.withResolvers<null>();
    const session = createMemorySessionStore();
    await session.set("tok");
    const api = createFakeFetch({
      ...emptySyncRoutes,
      "GET /api/me": async () => {
        await started.promise;
        return fakeMe;
      },
      "GET /api/notifications": () => ({ deliveries: {}, items: [], more: false }),
      "GET /api/sync/pull": () => problem(401, "auth/unauthorized"),
    });
    const client = createPaceClient({
      baseUrl: "https://api.test",
      deviceId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      fetch: api.fetch,
      now: () => "2026-10-06T12:00:00.000Z",
      session,
      source: "web",
      store: createMemoryEventStore(),
    });
    await expect.poll(() => api.pathsCalled("/api/me")).toHaveLength(1);
    // Alone, the start's check holds nothing: the first sync goes at once (and hears a 401).
    await client.sync.syncNow();
    expect(api.pathsCalled("/api/sync/pull")).toHaveLength(1);
    const refreshed = client.notifications.refresh();
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    // The 401 joined the start's `me` (no second one) and holds the bell's read behind it.
    expect(api.pathsCalled("/api/me")).toHaveLength(1);
    expect(api.pathsCalled("/api/notifications")).toEqual([]);
    started.resolve(null);
    await refreshed;
    expect(api.pathsCalled("/api/notifications")).toEqual(["/api/notifications"]);
    expect(api.pathsCalled("/api/me")).toHaveLength(1);
  });

  it.each(["before", "after"] as const)(
    'a run hung past the hold that lands %s the revoke\'s answer reads as nothing, never "ended elsewhere" (round 7 review 7)',
    async (when) => {
      const server = { isRevoked: false };
      const pull = Promise.withResolvers<null>();
      const revoked = Promise.withResolvers<null>();
      const atServer = Promise.withResolvers<null>();
      const { api, client } = await setup(
        {
          "DELETE /api/sessions/s-1": async () => {
            server.isRevoked = true;
            atServer.resolve(null);
            await revoked.promise;
            return { ok: true };
          },
          "GET /api/me": () => (server.isRevoked ? problem(401, "auth/unauthorized") : fakeMe),
          "GET /api/sync/pull": async () => {
            await pull.promise;
            return server.isRevoked
              ? problem(401, "auth/unauthorized")
              : { events: [], more: false, seq: 0, storeId: "store-test" };
          },
        },
        "tok",
      );
      await expect.poll(() => client.auth.store.getState().user).not.toBeNull();
      // A run whose request hangs: the hold gives up waiting for it after `HOLD_WAIT_MS`.
      const hung = client.sync.syncNow();
      const ended = client.auth.endThisDevice(async () => {
        await api.fetch("https://api.test/api/sessions/s-1", { method: "DELETE" });
      });
      if (when === "before") {
        // The server ended the session; its answer is still on its way when the run lands.
        await atServer.promise;
        pull.resolve(null);
        await hung;
        revoked.resolve(null);
        await ended;
      } else {
        revoked.resolve(null);
        await ended;
        pull.resolve(null);
        await hung;
      }
      await expect.poll(() => client.auth.store.getState().status).toBe("signed-out");
      expect(client.auth.store.getState().endedElsewhere).toBeUndefined();
      // The steady state: nothing asks the server about the ended session.
      const checks = api.pathsCalled("/api/me").length;
      await client.sync.syncNow();
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      expect(api.pathsCalled("/api/me")).toHaveLength(checks);
    },
  );

  it("signs out within seconds when its socket is refused at the door, not at the next poll (round 7 CI)", async () => {
    // The session ended while this visible tab's socket was still connecting: the refused upgrade
    // closes with no code (1006), every reconnect is refused too, and the poll is 30 s away.
    const socket = oneSocket();
    const server = { isRevoked: false };
    const { client } = await setup(
      {
        "GET /api/me": () => (server.isRevoked ? problem(401, "auth/unauthorized") : fakeMe),
        "GET /api/sync/pull": () =>
          server.isRevoked
            ? problem(401, "auth/unauthorized")
            : { events: [], more: false, seq: 0, storeId: "store-test" },
      },
      "tok",
      socket.create,
    );
    await expect.poll(() => client.auth.store.getState().user).not.toBeNull();
    await client.sync.syncNow();
    client.sync.start({ intervalMs: 30_000 });
    client.live.start();
    server.isRevoked = true;
    socket.emit("close", { code: 1006 });
    await expect
      .poll(() => client.auth.store.getState().status, { timeout: 3000 })
      .toBe("signed-out");
    expect(client.auth.store.getState().endedElsewhere).toBe(true);
    client.sync.stop();
    client.live.stop();
  });

  it("wires the state and the sync client on one store", async () => {
    const { api, client } = await setup({
      "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
    });
    expect(client.auth.store.getState().status).toBe("signed-out");
    expect(api.pathsCalled("/api")).toEqual([]);

    await client.auth.loginWithDev("1");
    await client.state.dispatch({
      occurredAt: "2026-10-06T10:00:00.000Z",
      payload: { language: "ru" },
      type: "settings.updated",
    });
    await expect(client.sync.syncNow()).resolves.toEqual({
      ok: true,
      value: { pulled: 0, pushed: 1 },
    });
    expect(api.pathsCalled("/api/sync")).toEqual([
      "/api/sync/pull",
      "/api/sync/push",
      "/api/sync/pull",
    ]);
    expect(client.state.store.getState().settings.language).toBe("ru");
  });

  it("exposes the actions and the clock, both on the same store", async () => {
    const { client } = await setup();
    expect(client.clock.now()).toBe("2026-10-06T12:00:00.000Z");
    const captured = await client.actions.captureInbox("buy milk");
    expect(captured.ok).toBe(true);
    expect(
      Object.values(client.state.store.getState().tasks.byId).map((task) => task.title),
    ).toEqual(["buy milk"]);
  });

  it("gives the API client the auth token", async () => {
    const { api, client } = await setup({
      "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
    });
    await client.auth.loginWithDev("1");
    await client.api.call(endpoints.me, {});
    expect(api.calls.at(-1)?.headers["authorization"]).toBe("Bearer tok_dev");
  });

  it("refreshes the user once a stored token is loaded", async () => {
    const { api, client } = await setup({}, "tok_stored");
    await expect
      .poll(() => client.auth.store.getState())
      .toEqual({ status: "signed-in", user: fakeUser });
    expect(api.pathsCalled("/api/me")).toEqual(["/api/me"]);
  });

  it("does not call the server for a signed-out device", async () => {
    const { api } = await setup();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(api.calls).toEqual([]);
  });
});

/** The assistant's answer from the activity field. */
const activityAnswer = (actions: readonly object[]) => ({
  confidence: 1,
  domain: "activity",
  actions,
  provider: "fake",
  status: "parsed",
});

describe("client.assistant", () => {
  const task = {
    description: null,
    dueAt: null,
    dueTz: null,
    estimateMinutes: 90,
    importance: null,
    link: null,
    presetId: "personal",
    projectId: null,
    projectName: null,
    sourceText: "разобрать почту, полтора часа",
    subtasks: [],
    title: "разобрать почту",
  };
  const parsed = {
    confidence: 1,
    domain: "task",
    actions: [{ kind: "task.create", summary: "New task: разобрать почту", task }],
    provider: "fake",
    status: "parsed",
  };

  it("sends the answer to the assistant's log with keepalive, so a page closed right after the press still sends it (bug-lessons 192)", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const api = createFakeFetch({
      ...emptySyncRoutes,
      "GET /api/me": () => fakeMe,
      "POST /api/decisions/resolve": () => ({ resolved: 1 }),
    });
    const client = createPaceClient({
      baseUrl: "https://api.test",
      deviceId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      fetch: async (url, init) => {
        sent.push({ init, url });
        return await api.fetch(url, init);
      },
      now: () => "2026-10-06T12:00:00.000Z",
      session: createMemorySessionStore(),
      source: "web",
      store: createMemoryEventStore(),
    });
    await client.auth.ready;
    await client.assistant.resolve(["01ARZ3NDEKTSV4RRFFQ69G5FAA"], "approved", null);
    const resolve = sent.find(({ url }) => url.endsWith("/api/decisions/resolve"));
    expect(resolve?.init.keepalive).toBe(true);
    // Every other call is an ordinary one.
    expect(sent.filter(({ init }) => init.keepalive === true)).toHaveLength(1);
  });

  it("sends the answer again without keepalive when a browser refuses the keepalive request (review minor 7)", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const api = createFakeFetch({
      ...emptySyncRoutes,
      "GET /api/me": () => fakeMe,
      "POST /api/decisions/resolve": () => ({ resolved: 1 }),
    });
    const client = createPaceClient({
      baseUrl: "https://api.test",
      deviceId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      fetch: async (url, init) => {
        sent.push({ init, url });
        if (init.keepalive === true) {
          // A browser that does not take keepalive with a preflight rejects before the network.
          throw new TypeError("Failed to fetch");
        }
        return await api.fetch(url, init);
      },
      now: () => "2026-10-06T12:00:00.000Z",
      session: createMemorySessionStore(),
      source: "web",
      store: createMemoryEventStore(),
    });
    await client.auth.ready;
    await client.assistant.resolve(["01ARZ3NDEKTSV4RRFFQ69G5FAA"], "approved", null);
    const resolves = sent.filter(({ url }) => url.endsWith("/api/decisions/resolve"));
    expect(resolves.map(({ init }) => init.keepalive === true)).toEqual([true, false]);
  });

  it("turns the parse into composer edits", async () => {
    const { client } = await setup({ "POST /api/parse": () => parsed });
    const outcome = await client.assistant.read("разобрать почту, полтора часа");
    expect(outcome).toMatchObject({
      reading: { edits: { estimateMinutes: 90, title: "разобрать почту" }, provider: "fake" },
      status: "read",
    });
  });

  it("reads an answer from a newer server with keys it does not know yet", async () => {
    const newer = {
      ...parsed,
      extra: "top",
      actions: [{ ...parsed.actions[0], extra: "action", task: { ...task, extra: "draft" } }],
    };
    const { client } = await setup({ "POST /api/parse": () => newer });
    expect(await client.assistant.read("разобрать почту, полтора часа")).toMatchObject({
      reading: { edits: { title: "разобрать почту" } },
      status: "read",
    });
  });

  it("passes on when the assistant is out of requests, and a failure as failed", async () => {
    const retryAt = "2026-10-06T12:05:00.000Z";
    const { client } = await setup({
      "POST /api/parse": () => ({
        confidence: 1,
        domain: "task",
        actions: [],
        retryAt,
        status: "unavailable",
      }),
    });
    // A server older than `reason`: it kept a text for later only with a time to wait for.
    expect(await client.assistant.read("что-то")).toEqual({
      canReadLater: true,
      reason: "limited",
      retryAt,
      status: "unavailable",
    });
    const broken = await setup({ "POST /api/parse": () => problem(500, "internal") });
    expect(await broken.client.assistant.read("что-то")).toEqual({ status: "failed" });
  });

  it("passes on why no model read it, and whether the server can keep it for later (bug class 99)", async () => {
    const answerFor = (reason: string | undefined) => (): object => ({
      confidence: 1,
      domain: "task",
      actions: [],
      ...(reason !== undefined && { reason }),
      retryAt: null,
      status: "unavailable",
    });
    const outcomes = await Promise.all(
      [undefined, "unreachable", "unreadable", "off", "tired"].map(async (reason) => {
        const { client } = await setup({ "POST /api/parse": answerFor(reason) });
        return await client.assistant.read("что-то");
      }),
    );
    expect(outcomes).toEqual([
      { canReadLater: false, reason: "unreachable", retryAt: null, status: "unavailable" },
      { canReadLater: true, reason: "unreachable", retryAt: null, status: "unavailable" },
      { canReadLater: false, reason: "unreadable", retryAt: null, status: "unavailable" },
      { canReadLater: false, reason: "off", retryAt: null, status: "unavailable" },
      { canReadLater: false, reason: "unreachable", retryAt: null, status: "unavailable" },
    ]);
  });

  it("offers a labelled rule action when the parse request itself fails", async () => {
    const { client } = await setup({ "POST /api/parse": () => problem(503, "unavailable") });
    const answer = await client.assistant.propose("ем", "activity");
    expect(ParseResponseSchema.safeParse(answer).success).toBe(true);
    expect(answer).toMatchObject({
      actions: [{ category: "food", kind: "activity.start", label: "ем" }],
      status: "unavailable",
    });
  });

  it("reads an activity note from the activity field, and nothing from another action", async () => {
    const bodies: unknown[] = [];
    const start = {
      category: "commute",
      expectMinutes: 20,
      kind: "activity.start",
      label: "ЦСС",
      summary: "Start: ЦСС",
    };
    const { client } = await setup({
      "POST /api/parse": (request) => {
        bodies.push(request.body);
        return activityAnswer([start]);
      },
    });
    expect(await client.assistant.readActivity("Пошел в ЦСС, 20мин")).toEqual({
      category: "commute",
      expectMinutes: 20,
      label: "ЦСС",
    });
    expect(bodies).toEqual([{ domain: "activity", text: "Пошел в ЦСС, 20мин" }]);
    const logged = await setup({
      "POST /api/parse": () =>
        activityAnswer([
          {
            category: "other",
            end: "2026-10-06T08:30:00.000Z",
            kind: "activity.log",
            label: "x",
            start: "2026-10-06T07:30:00.000Z",
            summary: "Log",
          },
        ]),
    });
    expect(await logged.client.assistant.readActivity("7:30-8:30 x")).toBeNull();
  });
});

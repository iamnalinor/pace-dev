import { describe, expect, it } from "vitest";

import { endpoints } from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { createPaceClient, type PaceClient } from "./create-client.ts";
import { createFakeFetch, emptySyncRoutes, type FakeRoute, fakeUser } from "./fake-fetch.fake.ts";
import { createMemorySessionStore } from "./session.ts";

const setup = async (
  routes: Readonly<Record<string, FakeRoute>> = {},
  storedToken?: string,
): Promise<{ readonly api: ReturnType<typeof createFakeFetch>; readonly client: PaceClient }> => {
  const session = createMemorySessionStore();
  if (storedToken !== undefined) {
    await session.set(storedToken);
  }
  const api = createFakeFetch({ ...emptySyncRoutes, "GET /api/me": () => fakeUser, ...routes });
  const client = createPaceClient({
    baseUrl: "https://api.test",
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

describe("createPaceClient", () => {
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
    expect(api.pathsCalled("/api/sync")).toEqual(["/api/sync/push", "/api/sync/pull"]);
    expect(client.state.store.getState().settings.language).toBe("ru");
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

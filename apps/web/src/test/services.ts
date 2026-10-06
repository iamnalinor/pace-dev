import { createMemoryEventStore, createMemorySessionStore, type SessionStore } from "@pace/client";

import { createServices, type PaceServices } from "#web/services.ts";

import { createFakeFetch, defaultRoutes, type FakeRoute } from "./fake-fetch.ts";

/** Services on memory adapters and a fake API, the way the app wires them. */
export const createTestServices = (
  options: {
    readonly routes?: Readonly<Record<string, FakeRoute>>;
    readonly session?: SessionStore;
  } = {},
): { readonly services: PaceServices; readonly api: ReturnType<typeof createFakeFetch> } => {
  const api = createFakeFetch({ ...defaultRoutes(), ...options.routes });
  const services = createServices({
    baseUrl: "http://api.test",
    botUsername: "TestBot",
    deviceId: "test-device",
    eventStore: createMemoryEventStore(),
    fetch: api.fetch,
    session: options.session ?? createMemorySessionStore(),
  });
  return { api, services };
};

/** A session store that already holds a token (the shell starts signed in). */
export const signedInSession = async (token = "tok-1919230638"): Promise<SessionStore> => {
  const session = createMemorySessionStore();
  await session.set(token);
  return session;
};

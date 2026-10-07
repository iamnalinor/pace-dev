import { createServices, type PaceServices } from "#web/services.ts";
import { createMemoryEventStore, createMemorySessionStore, type SessionStore } from "@pace/client";
import { createFakeFetch, type FakeFetch, type FakeRoute } from "@pace/client/testing";

import { defaultRoutes } from "./routes.ts";

/** Services on memory adapters and a fake API, the way the app wires them. */
export const createTestServices = (
  options: {
    readonly routes?: Readonly<Record<string, FakeRoute>>;
    readonly session?: SessionStore;
  } = {},
): { readonly services: PaceServices; readonly api: FakeFetch } => {
  const api = createFakeFetch({ ...defaultRoutes(), ...options.routes });
  const services = createServices({
    baseUrl: "https://api.test",
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

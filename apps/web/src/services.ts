import {
  type Clock,
  createPaceClient,
  type EventStore,
  type PaceClient,
  type SessionStore,
} from "@pace/client";
import { type AppHooks, createAppHooks } from "@pace/client/react";

import { API_BASE_URL, TELEGRAM_BOT } from "./platform/api-base.ts";
import { readDeviceId } from "./platform/device-id.ts";
import { createIdbEventStore } from "./platform/idb-event-store.ts";
import { createLocalSessionStore } from "./platform/local-session.ts";

/** Everything the screens reach through context: built once per page load. */
export type PaceServices = PaceClient & {
  readonly hooks: AppHooks;
  readonly botUsername: string;
};

export type ServiceDeps = {
  readonly baseUrl: string;
  readonly botUsername: string;
  /** Defaults to the system clock; tests pass a frozen one. */
  readonly clock?: Clock;
  readonly deviceId: string;
  readonly eventStore: EventStore;
  readonly fetch?: (input: string, init: RequestInit) => Promise<Response>;
  readonly session: SessionStore;
};

/** The client stack on the given adapters plus what only the web shell needs. */
export const createServices = (deps: ServiceDeps): PaceServices => {
  const client = createPaceClient({
    baseUrl: deps.baseUrl,
    ...(deps.clock !== undefined && { clock: deps.clock }),
    deviceId: deps.deviceId,
    ...(deps.fetch !== undefined && { fetch: deps.fetch }),
    session: deps.session,
    source: "web",
    store: deps.eventStore,
  });
  return { ...client, botUsername: deps.botUsername, hooks: createAppHooks(client.state, client.clock) };
};

/** The production wiring: IndexedDB log, localStorage session, the configured API origin. */
export const createWebServices = (): PaceServices =>
  createServices({
    baseUrl: API_BASE_URL,
    botUsername: TELEGRAM_BOT,
    deviceId: readDeviceId(),
    eventStore: createIdbEventStore(),
    session: createLocalSessionStore(),
  });

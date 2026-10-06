import {
  type ApiClient,
  type AppStateHandle,
  type Auth,
  createApiClient,
  createAppState,
  createAuth,
  createSyncClient,
  type EventStore,
  type SessionStore,
  type SyncClient,
} from "@pace/client";
import { type AppHooks, createAppHooks } from "@pace/client/react";

import { API_BASE_URL, TELEGRAM_BOT } from "./platform/api-base.ts";
import { readDeviceId } from "./platform/device-id.ts";
import { createIdbEventStore } from "./platform/idb-event-store.ts";
import { createLocalSessionStore } from "./platform/local-session.ts";

/** Everything the screens reach through context: built once per page load. */
export type PaceServices = {
  readonly api: ApiClient;
  readonly auth: Auth;
  readonly state: AppStateHandle;
  readonly sync: SyncClient;
  readonly hooks: AppHooks;
  readonly botUsername: string;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type ServiceDeps = {
  readonly baseUrl: string;
  readonly botUsername: string;
  readonly deviceId: string;
  readonly eventStore: EventStore;
  readonly fetch?: FetchLike;
  readonly session: SessionStore;
};

const now = (): string => new Date().toISOString();

/** Wires auth → API client → app state → sync client on the given adapters. */
export const createServices = (deps: ServiceDeps): PaceServices => {
  let tokenReader: () => string | undefined = () => undefined;
  const api = createApiClient({
    baseUrl: deps.baseUrl,
    ...(deps.fetch !== undefined && { fetch: deps.fetch }),
    token: () => tokenReader(),
  });
  const auth = createAuth({ api, session: deps.session });
  tokenReader = auth.token;
  const state = createAppState({
    deviceId: deps.deviceId,
    now,
    source: "web",
    store: deps.eventStore,
  });
  const sync = createSyncClient({ api, now, state, store: deps.eventStore });
  return { api, auth, botUsername: deps.botUsername, hooks: createAppHooks(state), state, sync };
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

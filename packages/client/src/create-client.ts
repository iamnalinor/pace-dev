import type { EventStore } from "./event-store.ts";
import type { SessionStore } from "./session.ts";

import { type ApiClient, createApiClient } from "./api-client.ts";
import { type Auth, createAuth } from "./auth.ts";
import { type AppStateHandle, createAppState } from "./state.ts";
import { createSyncClient, type SyncClient } from "./sync-client.ts";

export type PaceClient = {
  readonly api: ApiClient;
  readonly auth: Auth;
  readonly state: AppStateHandle;
  readonly sync: SyncClient;
};

export type PaceClientOptions = {
  readonly baseUrl: string;
  readonly deviceId: string;
  /** Defaults to the global `fetch`; tests pass a fake. */
  readonly fetch?: (input: string, init: RequestInit) => Promise<Response>;
  /** Defaults to the wall clock. */
  readonly now?: () => string;
  readonly session: SessionStore;
  readonly source: "app" | "web";
  readonly store: EventStore;
};

const wallClock = (): string => new Date().toISOString();

/**
Wires API client → auth → app state → sync on the platform adapters: the one way a shell
builds the client. A device that starts with a stored token refreshes its user right away.
*/
export const createPaceClient = (options: PaceClientOptions): PaceClient => {
  const now = options.now ?? wallClock;
  // The API client reads the token synchronously, so it is wired before auth exists.
  let token: () => string | undefined = () => undefined;
  const api = createApiClient({
    baseUrl: options.baseUrl,
    ...(options.fetch !== undefined && { fetch: options.fetch }),
    token: () => token(),
  });
  const auth = createAuth({ api, session: options.session });
  token = auth.token;
  const state = createAppState({
    deviceId: options.deviceId,
    now,
    source: options.source,
    store: options.store,
  });
  const sync = createSyncClient({ api, now, state, store: options.store });

  void (async (): Promise<void> => {
    await auth.ready;
    if (auth.store.getState().status === "signed-in") {
      await auth.me();
    }
  })();

  return { api, auth, state, sync };
};

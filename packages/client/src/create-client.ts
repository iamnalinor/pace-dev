import type { EventStore } from "./event-store.ts";
import type { SessionStore } from "./session.ts";

import { type Actions, createActions } from "./actions/actions.ts";
import { type ApiClient, createApiClient } from "./api-client.ts";
import { type Assistant, createAssistant } from "./assistant.ts";
import { type Auth, createAuth } from "./auth.ts";
import { type Clock, systemClock } from "./clock.ts";
import { type AppStateHandle, createAppState } from "./state.ts";
import { createSyncClient, type SyncClient } from "./sync-client.ts";

export type PaceClient = {
  readonly actions: Actions;
  readonly api: ApiClient;
  /** The LLM reading of free text (needs the network; nothing is written). */
  readonly assistant: Assistant;
  readonly auth: Auth;
  readonly clock: Clock;
  readonly state: AppStateHandle;
  readonly sync: SyncClient;
};

export type PaceClientOptions = {
  readonly baseUrl: string;
  /** Defaults to the system clock; tests pass a frozen one. */
  readonly clock?: Clock;
  readonly deviceId: string;
  /** Defaults to the global `fetch`; tests pass a fake. */
  readonly fetch?: (input: string, init: RequestInit) => Promise<Response>;
  /** Defaults to the clock's `now`. */
  readonly now?: () => string;
  readonly session: SessionStore;
  readonly source: "app" | "web";
  readonly store: EventStore;
};

/**
Wires API client → auth → app state → sync → actions on the platform adapters: the one
way a shell builds the client. A device that starts with a stored token refreshes its
user right away.
*/
export const createPaceClient = (options: PaceClientOptions): PaceClient => {
  const base = options.clock ?? systemClock();
  // `now` may be overridden on its own (the sync loop takes it too), so the clock follows it.
  const clock: Clock = { deviceTz: base.deviceTz, now: options.now ?? base.now };
  const { now } = clock;
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
  const actions = createActions({ clock, source: options.source, state });

  void (async (): Promise<void> => {
    await auth.ready;
    if (auth.store.getState().status === "signed-in") {
      await auth.me();
    }
  })();

  const assistant = createAssistant({ api, clock, state });
  return { actions, api, assistant, auth, clock, state, sync };
};

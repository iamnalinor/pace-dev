import type { EventStore } from "./event-store.ts";
import type { SessionStore } from "./session.ts";

import { type Actions, createActions } from "./actions/actions.ts";
import { type ApiClient, createApiClient } from "./api-client.ts";
import { type Assistant, createAssistant } from "./assistant.ts";
import { type Auth, createAuth } from "./auth.ts";
import { type Clock, systemClock } from "./clock.ts";
import { createLiveChannel, type LiveChannel, type SocketLike } from "./live.ts";
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
  /** The server's "your log grew" line; started and stopped with the sync loop. */
  readonly live: LiveChannel;
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
  /** Defaults to the global `WebSocket`; tests pass a fake. */
  readonly createSocket?: (url: string, protocols: readonly string[]) => SocketLike;
};

/** The local state and its sync: a local change is sent within a second. */
const stateAndSync = (
  options: PaceClientOptions,
  api: ApiClient,
  now: () => string,
): { readonly state: AppStateHandle; readonly sync: SyncClient } => {
  // The sync is wired after the state it reads, so the state reaches it through this.
  const wiring = { sendSoon: (): void => undefined };
  const state = createAppState({
    deviceId: options.deviceId,
    now,
    onLocal: () => {
      wiring.sendSoon();
    },
    source: options.source,
    store: options.store,
  });
  const sync = createSyncClient({ api, now, state, store: options.store });
  wiring.sendSoon = sync.soon;
  return { state, sync };
};

/** The live channel next to the API: a server's "changed" asks the sync for a run. */
const liveChannelOf = (
  options: PaceClientOptions,
  wiring: { readonly onChange: () => void; readonly token: () => string | undefined },
): LiveChannel =>
  createLiveChannel({
    baseUrl: options.baseUrl,
    ...(options.createSocket !== undefined && { createSocket: options.createSocket }),
    deviceId: options.deviceId,
    onChange: wiring.onChange,
    token: wiring.token,
  });

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
  const { state, sync } = stateAndSync(options, api, now);
  const live = liveChannelOf(options, { onChange: sync.soon, token: auth.token });
  const actions = createActions({ clock, source: options.source, state });

  void (async (): Promise<void> => {
    await auth.ready;
    if (auth.store.getState().status === "signed-in") {
      await auth.me();
    }
  })();

  const assistant = createAssistant({ api, clock, state });
  return { actions, api, assistant, auth, clock, live, state, sync };
};

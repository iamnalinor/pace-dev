import type { LiveNotice } from "@pace/core";

import type { EventStore } from "./event-store.ts";
import type { SessionStore } from "./session.ts";

import { type Actions, createActions } from "./actions/actions.ts";
import { type ApiClient, createApiClient } from "./api-client.ts";
import { type Assistant, createAssistant } from "./assistant.ts";
import { type Auth, createAuth } from "./auth.ts";
import { type Clock, systemClock } from "./clock.ts";
import { createLiveChannel, type LiveChannel, type SocketLike } from "./live.ts";
import { createNotificationFeed, type NotificationFeed, parseLiveNotice } from "./notifications.ts";
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
  /** The notification pool, kept current by the live line. */
  readonly notifications: NotificationFeed;
  /** Other live messages about the pool (a new notification to show, one to take back). */
  readonly onNotice: (listener: (notice: LiveNotice) => void) => () => void;
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
  wiring: {
    readonly onChange: () => void;
    readonly onMessage: (message: unknown) => void;
    readonly onSessionEnded: () => void;
    readonly token: () => string | undefined;
  },
): LiveChannel =>
  createLiveChannel({
    baseUrl: options.baseUrl,
    ...(options.createSocket !== undefined && { createSocket: options.createSocket }),
    deviceId: options.deviceId,
    onChange: wiring.onChange,
    onMessage: wiring.onMessage,
    onSessionEnded: wiring.onSessionEnded,
    token: wiring.token,
  });

/** The live channel's other messages: the pool's notices go to the feed, then to the listeners. */
const noticeRouter = (
  feed: NotificationFeed,
): {
  readonly feed: NotificationFeed;
  readonly onMessage: (message: unknown) => void;
  readonly onNotice: PaceClient["onNotice"];
} => {
  const listeners = new Set<(notice: LiveNotice) => void>();
  return {
    feed,
    onMessage: (message) => {
      const notice = parseLiveNotice(message);
      if (notice === null) {
        return;
      }
      feed.receive(notice);
      for (const listener of listeners) {
        listener(notice);
      }
    },
    onNotice: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
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
  const { state, sync } = stateAndSync(options, api, now);
  const notices = noticeRouter(createNotificationFeed({ api, source: options.source }));
  const live: LiveChannel = liveChannelOf(options, {
    onChange: () => {
      sync.soon();
    },
    onMessage: notices.onMessage,
    // The server ended the socket's session: `me` signs out on its 401, so the app goes to
    // sign-in; a session still good (an expiry the server misjudged) gets its socket back.
    onSessionEnded: () => {
      void (async (): Promise<void> => {
        const checked = await auth.me();
        if (checked.ok) {
          live.start();
        }
      })();
    },
    token: auth.token,
  });
  const actions = createActions({ clock, source: options.source, state });

  void (async (): Promise<void> => {
    await auth.ready;
    if (auth.store.getState().status === "signed-in") {
      await auth.me();
    }
  })();

  const assistant = createAssistant({ api, clock, state });
  const { feed: notifications, onNotice } = notices;
  return { actions, api, assistant, auth, clock, live, notifications, onNotice, state, sync };
};

import type { LiveNotice } from "@pace/core";

import type { EventStore } from "./event-store.ts";
import type { SessionStore } from "./session.ts";

import { type Actions, createActions } from "./actions/actions.ts";
import { type ApiClient, createApiClient } from "./api-client.ts";
import { type Assistant, createAssistant } from "./assistant.ts";
import { type Auth, createAuth } from "./auth.ts";
import { type Clock, systemClock } from "./clock.ts";
import {
  createLiveChannel,
  type LiveChannel,
  type LiveEventsPage,
  type SocketLike,
} from "./live.ts";
import { createNotificationFeed, type NotificationFeed, parseLiveNotice } from "./notifications.ts";
import { parseStoreChange, type PeerTabs } from "./peer-tabs.ts";
import { type AppStateHandle, createAppState } from "./state.ts";
import { createSyncClient, type SyncClient } from "./sync-client.ts";
import {
  httpTransport,
  preferSocket,
  socketTransport,
  type SyncTransport,
} from "./sync-transport.ts";

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
  /**
  Lets go of what would outlive a client nobody uses any more (a runtime replaced for another
  server, React's second effect run in development): the line to the other tabs. The sync loop
  and the socket are stopped by whoever started them.
  */
  readonly close: () => void;
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
  /** The other tabs sharing this store (a browser profile's), told of every change to it. */
  readonly peers?: PeerTabs | undefined;
  readonly session: SessionStore;
  readonly source: "app" | "web";
  readonly store: EventStore;
  /** Defaults to the global `WebSocket`; tests pass a fake. */
  readonly createSocket?: (url: string, protocols: readonly string[]) => SocketLike;
};

/**
The local state and its sync: a local change is sent within a second, over the live socket while
it can carry it and over HTTP otherwise (decided per call, see `sync-transport.ts`).
*/
const stateAndSync = (
  options: PaceClientOptions,
  transport: SyncTransport,
  now: () => string,
): {
  readonly state: AppStateHandle;
  readonly sync: SyncClient;
  readonly closePeers: () => void;
} => {
  // The sync is wired after the state it reads, so the state reaches it through this.
  const wiring = { sendSoon: (): void => undefined };
  const state = createAppState({
    deviceId: options.deviceId,
    now,
    onLocal: () => {
      wiring.sendSoon();
    },
    ...(options.peers !== undefined && { onStored: options.peers.post }),
    source: options.source,
    store: options.store,
  });
  const stopListening = options.peers?.listen((message) => {
    const change = parseStoreChange(message);
    if (change !== null) {
      void state.adoptPeerChange(change);
    }
  });
  const sync = createSyncClient({
    now,
    state,
    store: options.store,
    transport,
  });
  wiring.sendSoon = sync.soon;
  const closePeers = (): void => {
    stopListening?.();
    options.peers?.close();
  };
  return { closePeers, state, sync };
};

/**
The live channel next to the API: a server's "changed" asks the sync for a run, new events go
to the sync to apply.
*/
const liveChannelOf = (
  options: PaceClientOptions,
  wiring: {
    readonly onChange: () => void;
    readonly onEvents: (page: LiveEventsPage) => void;
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
    onEvents: wiring.onEvents,
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
The live channel and the sync it carries: the channel is made first (the sync's calls go over
it) and reaches the sync once that exists; nothing arrives before `start`.
*/
const liveAndSync = (
  options: PaceClientOptions,
  deps: {
    readonly api: ApiClient;
    readonly auth: Auth;
    readonly now: () => string;
    readonly onMessage: (message: unknown) => void;
  },
): {
  readonly closePeers: () => void;
  readonly live: LiveChannel;
  readonly state: AppStateHandle;
  readonly sync: SyncClient;
} => {
  const { api, auth } = deps;
  const wired: { sync?: SyncClient } = {};
  const live: LiveChannel = liveChannelOf(options, {
    onChange: () => {
      wired.sync?.soon();
    },
    onEvents: (page) => {
      void wired.sync?.ingestLive(page);
    },
    onMessage: deps.onMessage,
    // The server ended the socket's session: `me` signs out on its 401, so the app goes to
    // sign-in; a session still good (an expiry the server misjudged) gets its socket back.
    onSessionEnded: () => {
      // Forgotten here already (this device ended itself): nothing to check, no 401 to provoke.
      if (auth.token() === undefined) {
        return;
      }
      void (async (): Promise<void> => {
        const checked = await auth.me();
        if (checked.ok) {
          live.start();
        }
      })();
    },
    token: auth.token,
  });
  const transport = preferSocket(socketTransport(live), httpTransport(api));
  const { closePeers, state, sync } = stateAndSync(options, transport, deps.now);
  wired.sync = sync;
  return { closePeers, live, state, sync };
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
  const notices = noticeRouter(createNotificationFeed({ api, source: options.source }));
  const { closePeers, live, state, sync } = liveAndSync(options, {
    api,
    auth,
    now,
    onMessage: notices.onMessage,
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
  return {
    actions,
    api,
    assistant,
    auth,
    clock,
    close: closePeers,
    live,
    notifications,
    onNotice,
    state,
    sync,
  };
};

import type { EndpointShape, LiveNotice } from "@pace/core";

import type { EventStore } from "./event-store.ts";

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
import { type SessionChecks, sessionChecks } from "./session-checks.ts";
import { noteMark, type SessionStore, type SignOutNotes } from "./session.ts";
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
  How many local changes the server has not acknowledged yet (the outbox): Log out asks before it
  discards them with the local copy (QA round 23 R23-02).
  */
  readonly unsyncedCount: () => Promise<number>;
  /**
  Marks the local copy as the session of `token` (by a mark, never the token): at sign-in, before
  the sync writes into it, so a stale tab of the same browser can tell it is no longer its own.
  */
  readonly claimLocalCopy: (token: string) => Promise<void>;
  /**
  Drops the local copy on sign-out unless another session claimed it since: the check and the
  clear are one transaction of the store, so a stale tab's late 401 never wipes what a tab that
  signed in meanwhile wrote (round 6 I1, re-review N3). The state is emptied either way.
  */
  readonly dropLocalCopyOf: (token: string) => Promise<void>;
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
  /** The note a tab that logs out leaves the other tabs of its browser profile (the web only). */
  readonly signOutNotes?: SignOutNotes | undefined;
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
    readonly onDropped: () => void;
    readonly onFailedToOpen: () => void;
    readonly onEvents: (page: LiveEventsPage) => void;
    readonly onMessage: (message: unknown) => void;
    readonly onSessionEnded: () => void;
    readonly sessionCheck: () => Promise<unknown> | undefined;
    readonly token: () => string | undefined;
  },
): LiveChannel =>
  createLiveChannel({
    baseUrl: options.baseUrl,
    ...(options.createSocket !== undefined && { createSocket: options.createSocket }),
    deviceId: options.deviceId,
    onChange: wiring.onChange,
    onDropped: wiring.onDropped,
    onEvents: wiring.onEvents,
    onFailedToOpen: wiring.onFailedToOpen,
    onMessage: wiring.onMessage,
    onSessionEnded: wiring.onSessionEnded,
    sessionCheck: wiring.sessionCheck,
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
    readonly checks: SessionChecks;
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
    // The socket went: a run finds out at once whether the server is still there (the offline
    // line), instead of at the next safety poll; its failures keep the sync's own backoff.
    onDropped: () => {
      wired.sync?.soon();
    },
    onEvents: (page) => {
      void wired.sync?.ingestLive(page);
    },
    // Refused at the door (or no server): a run's 401 checks the session (`sessionCheck`), its
    // network failure shows the offline line; else a session ended while this socket was still
    // connecting would sign out only at the next poll, 30 s on (round 7 CI).
    onFailedToOpen: () => {
      wired.sync?.soon();
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
        // The same check a call's 401 starts: what else would send the session waits for it.
        const checked = await deps.checks.check();
        if (checked.ok) {
          live.start();
        }
      })();
    },
    sessionCheck: (): Promise<unknown> | undefined => deps.checks.pending(),
    token: auth.token,
  });
  const transport = preferSocket(socketTransport(live), httpTransport(api));
  const { closePeers, state, sync } = stateAndSync(options, transport, deps.now);
  wired.sync = sync;
  return { closePeers, live, state, sync };
};

/**
The API client and the auth it reads: the token (synchronously, on every request) and whether this
device's session has ended; each 401 of it checks the session, and a call waits for a check under way.
*/
const apiAndAuth = (
  options: PaceClientOptions,
): { readonly api: ApiClient; readonly auth: Auth; readonly checks: SessionChecks } => {
  // The API client reads the token synchronously, so it is wired before auth exists.
  const wiring = {
    hasEnded: (): boolean => false,
    heard: (_credential: string, _endpoint: EndpointShape): void => undefined,
    pending: (_endpoint: EndpointShape): Promise<unknown> | undefined => undefined,
    token: (): string | undefined => undefined,
  };
  const api = createApiClient({
    baseUrl: options.baseUrl,
    ...(options.fetch !== undefined && { fetch: options.fetch }),
    onUnauthorized: (credential, endpoint) => {
      wiring.heard(credential, endpoint);
    },
    sessionCheck: (endpoint): Promise<unknown> | undefined => wiring.pending(endpoint),
    sessionEnded: () => wiring.hasEnded(),
    token: () => wiring.token(),
  });
  const auth = createAuth({ api, notes: options.signOutNotes, session: options.session });
  const checks = sessionChecks(auth, api);
  wiring.token = auth.token;
  wiring.hasEnded = auth.hasEnded;
  wiring.heard = checks.heard;
  wiring.pending = checks.pending;
  return { api, auth, checks };
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
  const { api, auth, checks } = apiAndAuth(options);
  const notices = noticeRouter(createNotificationFeed({ api, source: options.source }));
  const { closePeers, live, state, sync } = liveAndSync(options, {
    api,
    auth,
    checks,
    now,
    onMessage: notices.onMessage,
  });
  const actions = createActions({ clock, source: options.source, state });

  void (async (): Promise<void> => {
    await auth.ready;
    if (auth.store.getState().status === "signed-in") {
      // The start's `me` is the check a 401 meanwhile joins (holding from then on); alone it
      // holds nothing, so the first sync and the socket start at once (CI fix review m3).
      await checks.check({ holds: false });
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
    unsyncedCount: async () => {
      const pending = await options.store.listPending();
      return pending.length;
    },
    claimLocalCopy: async (token) => {
      await state.claim(noteMark(token));
    },
    dropLocalCopyOf: async (token) => {
      await state.clear(noteMark(token));
    },
  };
};

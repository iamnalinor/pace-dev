import { createStore, type StoreApi } from "zustand/vanilla";

import {
  LIVE_SESSION_ENDED,
  LIVE_V1,
  LIVE_V2,
  type LiveClientMessage,
  type LiveServerMessage,
  LiveServerMessageSchema,
  PROTOCOL,
} from "@pace/core";

import { createRequests, LiveUnavailable } from "./live-requests.ts";

type SocketEvent = "close" | "message" | "open";

/** The part of a WebSocket the channel uses (the browser's and React Native's both fit). */
export type SocketLike = {
  readonly addEventListener: (
    type: SocketEvent,
    listener: (event: { readonly code?: unknown; readonly data?: unknown }) => void,
  ) => void;
  readonly send: (data: string) => void;
  readonly close: () => void;
};

export type LiveStatus = { readonly isConnected: boolean };

/** A page of the store's log as a v2 socket carries it (a pull's answer, or new events unasked). */
export type LiveEventsPage = Omit<Extract<LiveServerMessage, { type: "events" }>, "id" | "type">;

export type LiveChannel = {
  readonly status: StoreApi<LiveStatus>;
  readonly start: () => void;
  readonly stop: () => void;
  /**
  Sends a v2 request and resolves with the server's message of the same id (whatever its type:
  the caller reads it); rejects with `LiveUnavailable` when it cannot be made or answered.
  */
  readonly request: (message: LiveClientMessage) => Promise<LiveServerMessage>;
  /** Whether the open socket speaks `pace.v2` (its server said `hello`). */
  readonly isV2: () => boolean;
};

export type LiveChannelOptions = {
  readonly baseUrl: string;
  readonly deviceId: string;
  readonly token: () => string | undefined;
  /** Something may have changed on the server: pull. Called on every (re)connect too. */
  readonly onChange: () => void;
  /** Any other message the server sends (the notification pool's), parsed from JSON. */
  readonly onMessage?: (message: unknown) => void;
  /** New events a v2 socket brings unasked (or a pull's answer that came too late). */
  readonly onEvents?: (page: LiveEventsPage) => void;
  /**
  The server closed the socket because its session ended (revoked, logged out, expired): the
  channel stops reconnecting until it is started again (a reconnect would only be refused), and
  the app checks its session.
  */
  readonly onSessionEnded?: () => void;
  /** Defaults to the global `WebSocket`; tests pass a fake. */
  readonly createSocket?: (url: string, protocols: readonly string[]) => SocketLike;
};

/** Often enough that no proxy closes an idle socket; the server answers without waking. */
const PING_MS = 45_000;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 60_000;

/**
The socket's address next to the API's: `https` becomes `wss`; the device and this build's
protocol ride along in the query, since a socket cannot carry the `X-Pace-Protocol` header.
*/
export const liveUrl = (baseUrl: string, deviceId: string): string => {
  const url = new URL("/api/sync/live", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${url.href}?device=${encodeURIComponent(deviceId)}&protocol=${String(PROTOCOL)}`;
};

/** The platform's WebSocket; `undefined` where there is none (a test runner), and nothing opens. */
const globalSocket =
  typeof WebSocket === "undefined"
    ? undefined
    : (url: string, protocols: readonly string[]): SocketLike => new WebSocket(url, [...protocols]);

/** A JSON message as an object; `null` for `pong` and anything else. */
const parseMessage = (data: unknown): null | { readonly type?: unknown } => {
  if (typeof data !== "string" || !data.startsWith("{")) {
    return null;
  }
  try {
    return JSON.parse(data) as { readonly type?: unknown };
  } catch {
    return null;
  }
};

/** A dropped socket comes back after 1 s, 2 s, 4 s, … at most a minute. */
const retryDelay = (failures: number): number =>
  Math.min(RETRY_MIN_MS * 2 ** (failures - 1), RETRY_MAX_MS);

/** The keep-alive and the pending reconnect of one channel. */
const createTimers = () => {
  let ping: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  return {
    clear: (): void => {
      clearInterval(ping);
      clearTimeout(retry);
      ping = undefined;
      retry = undefined;
    },
    keepAlive: (socket: SocketLike): void => {
      ping = setInterval(() => {
        socket.send("ping");
      }, PING_MS);
    },
    retryIn: (delayMs: number, connect: () => void): void => {
      retry = setTimeout(connect, delayMs);
    },
  };
};

type Handlers = {
  readonly open: () => void;
  readonly hello: () => void;
  readonly changed: () => void;
  readonly answer: (message: LiveServerMessage) => boolean;
  readonly events?: ((page: LiveEventsPage) => void) | undefined;
  readonly message?: ((message: unknown) => void) | undefined;
  readonly close: (code: unknown) => void;
};

const SYNC_TYPES = new Set(["changed", "error", "events", "hello", "pushed"] as const);

type SyncMessage = Extract<
  LiveServerMessage,
  { type: typeof SYNC_TYPES extends Set<infer T> ? T : never }
>;

const isSyncMessage = (message: LiveServerMessage): message is SyncMessage =>
  (SYNC_TYPES as ReadonlySet<string>).has(message.type);

/** A message of the sync protocol: the server speaks v2, the log grew, an answer, new events. */
const onSyncMessage = (message: SyncMessage, on: Handlers): void => {
  switch (message.type) {
    case "hello": {
      on.hello();
      return;
    }
    case "changed": {
      on.changed();
      return;
    }
    case "events": {
      if (!on.answer(message)) {
        const { events, more, seq, since, storeId } = message;
        on.events?.({ events, more, seq, since, storeId });
      }
      return;
    }
    case "error":
    case "pushed": {
      // One that answers no open request was given up on: HTTP has taken it over.
      on.answer(message);
    }
  }
};

/**
One message as the channel reads it: the sync protocol's own goes to `onSyncMessage`; a type a
newer server added is passed over; the rest (the pool's notices, also when off-contract) goes
to `message` as parsed JSON, which reads it with its own schema.
*/
const onMessage = (raw: { readonly type?: unknown }, on: Handlers): void => {
  const parsed = LiveServerMessageSchema.safeParse(raw);
  if (parsed.success && isSyncMessage(parsed.data)) {
    onSyncMessage(parsed.data, on);
  } else if (!parsed.success || parsed.data.type !== "unknown") {
    on.message?.(raw);
  }
};

/** Wires one socket: open, its messages, close. */
const follow = (socket: SocketLike, on: Handlers): void => {
  socket.addEventListener("open", on.open);
  socket.addEventListener("message", ({ data }) => {
    const message = parseMessage(data);
    if (message !== null) {
      onMessage(message, on);
    }
  });
  socket.addEventListener("close", ({ code }) => {
    on.close(code);
  });
};

/**
The socket in use, whether it speaks v2 (its server said `hello`), and the requests open on it.
A request without an answer in time means the socket went quiet: it is closed and `onQuiet` runs
at once, without waiting for its close event, which a half-open socket (a network switch) may not
send for minutes; meanwhile the channel would read as connected and poll rarely.
*/
const createLine = (onQuiet: () => void) => {
  let socket: SocketLike | undefined;
  let isV2 = false;
  const requests = createRequests(() => {
    const quiet = socket;
    // Dropped first, so its close event (if it ever comes) is one of a socket no longer current.
    onQuiet();
    quiet?.close();
  });
  return {
    current: (): SocketLike | undefined => socket,
    /** The socket is gone (or replaced): its requests fail. */
    drop: (): void => {
      socket = undefined;
      isV2 = false;
      requests.failAll();
    },
    // A socket already replaced saying hello late says nothing about the current one.
    hello: (from: SocketLike): void => {
      if (socket === from) {
        isV2 = true;
      }
    },
    isV2: (): boolean => isV2,
    request: async (message: LiveClientMessage): Promise<LiveServerMessage> => {
      const open = socket;
      if (open === undefined || !isV2) {
        throw new LiveUnavailable("closed");
      }
      return await requests.open(message.id, () => {
        open.send(JSON.stringify(message));
      });
    },
    settle: requests.settle,
    use: (next: SocketLike): void => {
      socket = next;
      isV2 = false;
    },
  };
};

type Line = ReturnType<typeof createLine>;

/** What one socket's events do: the line reads answers and `hello`, the channel the rest. */
const handlersFor = (
  socket: SocketLike,
  line: Line,
  on: {
    readonly close: (code: unknown) => void;
    readonly open: () => void;
    readonly options: LiveChannelOptions;
  },
): Handlers => ({
  answer: line.settle,
  changed: on.options.onChange,
  // A socket already replaced (or stopped) closing says nothing about the current one.
  close: (code) => {
    if (line.current() === socket) {
      on.close(code);
    }
  },
  events: on.options.onEvents,
  hello: () => {
    line.hello(socket);
  },
  message: on.options.onMessage,
  open: on.open,
});

/**
The server's line to the user's store: a WebSocket that offers `pace.v2` first and `pace.v1`
second. Every reconnect (to catch up on what was missed) and every v1 `changed` asks for a pull;
on v2 the socket also carries requests (`request`: push and pull, answered by id) and brings new
events as they land (`onEvents`). Polling and HTTP stay as the fallback while it is down.
*/
export const createLiveChannel = (options: LiveChannelOptions): LiveChannel => {
  const createSocket = options.createSocket ?? globalSocket;
  const status = createStore<LiveStatus>(() => ({ isConnected: false }));
  const timers = createTimers();
  // A quiet socket is gone as of now (its late close event is ignored: it is no longer current).
  const line = createLine(() => {
    closed(undefined);
  });
  let failures = 0;
  let isRunning = false;
  /** The socket is gone: its requests fail, and it comes back unless its session ended. */
  const closed = (code: unknown): void => {
    line.drop();
    timers.clear();
    status.setState({ isConnected: false });
    if (isRunning && code === LIVE_SESSION_ENDED) {
      isRunning = false;
      options.onSessionEnded?.();
    } else if (isRunning) {
      failures += 1;
      timers.retryIn(retryDelay(failures), connect);
    }
  };
  function connect(): void {
    const token = options.token();
    if (createSocket === undefined || token === undefined || !isRunning) {
      return;
    }
    const url = liveUrl(options.baseUrl, options.deviceId);
    const socket = createSocket(url, [LIVE_V2, LIVE_V1, `pace.auth.${token}`]);
    line.use(socket);
    const opened = (): void => {
      failures = 0;
      timers.keepAlive(socket);
      status.setState({ isConnected: true });
      options.onChange();
    };
    follow(socket, handlersFor(socket, line, { close: closed, open: opened, options }));
  }
  return {
    isV2: line.isV2,
    request: line.request,
    start: () => {
      if (isRunning) {
        return;
      }
      isRunning = true;
      connect();
    },
    status,
    stop: () => {
      isRunning = false;
      const socket = line.current();
      // Its requests fail and v2 ends with it, before it closes.
      closed(undefined);
      socket?.close();
    },
  };
};

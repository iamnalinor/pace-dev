import { createStore, type StoreApi } from "zustand/vanilla";

import {
  LIVE_V1,
  LIVE_V2,
  type LiveClientMessage,
  type LiveServerMessage,
  type LogHead,
  PROTOCOL,
} from "@pace/core";

import type { LiveEventsPage } from "./live-types.ts";

import { type LiveHandlers as Handlers, onLiveMessage } from "./live-messages.ts";
import { createRequests, LiveUnavailable } from "./live-requests.ts";
import { createRun, type Run } from "./live-run.ts";
import { createTimers, type LiveTimers, retryDelay } from "./live-timers.ts";

type SocketEvent = "close" | "message" | "open";

/** The part of a WebSocket the channel uses (the browser's and React Native's both fit). */
export type SocketLike = {
  readonly addEventListener: (
    type: SocketEvent,
    listener: (event: { readonly code?: unknown; readonly data?: unknown }) => void,
  ) => void;
  readonly send: (data: string) => void;
  readonly close: () => void;
  /** The subprotocol the server chose, once open (a browser's and React Native's socket say it). */
  readonly protocol?: string | undefined;
};

export type LiveStatus = { readonly isConnected: boolean };

/** A page of the store's log as a v2 socket carries it (a pull's answer, or new events unasked). */
export type { LiveEventsPage } from "./live-types.ts";

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
  /**
  Something may have changed on the server: pull. Called on every (re)connect too, unless the
  server's hello names where its log stands (`onHello` then decides).
  */
  readonly onChange: () => void;
  /**
  A v2 socket's hello named where the server's log stood as it opened: the copy pulls only if it
  is not there yet (QA PR55-1-12). Without it, every connect asks for a pull (`onChange`).
  */
  readonly onHello?: (head: LogHead) => void;
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
  /**
  A socket that had lived (up `STABLE_MS`) went (closed by the network or the server, or gone
  quiet), not stopped: the app checks whether the server can still be reached, so a stale screen
  is told it is stale (QA round 18 M4). Once per connection: the failed reconnects after it do
  not repeat it, nor do sockets cut soon after they open (a flapping link, fix round 5 V2).
  */
  readonly onDropped?: () => void;
  /**
  A socket closed before it ever opened: refused at the door (its session ended while it was
  connecting) or no server to reach. A browser gives a refused upgrade no close code, so the app
  looks for itself (a run whose 401 checks the session); else a device signed out elsewhere would
  wait for its next poll (round 7 CI). Once per streak: its refused reconnects do not repeat it,
  a socket that opens ends the streak.
  */
  readonly onFailedToOpen?: () => void;
  /**
  A check of the session that is under way (a 401 heard, `me` on its way), or `undefined`: a
  (re)connect waits for its answer and then opens with whatever session is current, so the
  session's end is not sent again while it is being confirmed (CI run 41668309388).
  */
  readonly sessionCheck?: () => Promise<unknown> | undefined;
  /** Defaults to the global `WebSocket`; tests pass a fake. */
  readonly createSocket?: (url: string, protocols: readonly string[]) => SocketLike;
};

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

/**
Whether a socket's catch-up waits for the server's hello: it opened speaking v2, whose first
message is the hello. One that does not say its protocol (a test's fake) or speaks v1 catches up
on open.
*/
const isCaughtUpOnHello = (socket: SocketLike): boolean => socket.protocol === LIVE_V2;

/** Wires one socket: open, its messages (a keep-alive's pong among them), close. */
const follow = (socket: SocketLike, on: Handlers): void => {
  socket.addEventListener("open", on.open);
  socket.addEventListener("message", ({ data }) => {
    if (data === "pong") {
      on.pong();
      return;
    }
    const message = parseMessage(data);
    if (message !== null) {
      onLiveMessage(message, on);
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
  const quiet = (): void => {
    const gone = socket;
    // Dropped first, so its close event (if it ever comes) is one of a socket no longer current.
    onQuiet();
    gone?.close();
  };
  const requests = createRequests(quiet);
  return {
    current: (): SocketLike | undefined => socket,
    /** A keep-alive went unanswered on `from`: if it is still the socket in use, it is quiet. */
    goneQuiet: (from: SocketLike): void => {
      if (socket === from) {
        quiet();
      }
    },
    /** The socket is gone (or replaced): its requests fail. */
    drop: (): void => {
      socket = undefined;
      isV2 = false;
      requests.failAll();
    },
    // A socket already replaced saying hello late says nothing about the current one.
    hello: (from: SocketLike): boolean => {
      if (socket === from) {
        isV2 = true;
      }
      return socket === from;
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
    invalid: requests.invalid,
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
    readonly pong: () => void;
    readonly options: LiveChannelOptions;
  },
): Handlers => ({
  answer: line.settle,
  invalid: line.invalid,
  changed: on.options.onChange,
  // A socket already replaced (or stopped) closing says nothing about the current one.
  close: (code) => {
    if (line.current() === socket) {
      on.close(code);
    }
  },
  events: on.options.onEvents,
  hello: (head) => {
    if (!line.hello(socket) || !isCaughtUpOnHello(socket)) {
      return;
    }
    const { onChange, onHello } = on.options;
    if (head === null || onHello === undefined) {
      onChange();
    } else {
      onHello(head);
    }
  },
  message: on.options.onMessage,
  open: on.open,
  pong: () => {
    if (line.current() === socket) {
      on.pong();
    }
  },
});

/**
The server's line to the user's store: a WebSocket that offers `pace.v2` first and `pace.v1`
second. Every reconnect (to catch up on what was missed) and every v1 `changed` asks for a pull;
on v2 the socket also carries requests (`request`: push and pull, answered by id) and brings new
events as they land (`onEvents`). Polling and HTTP stay as the fallback while it is down.
*/
/** The socket is gone: its requests fail, and it comes back unless its session ended. */
const whenClosed = (
  code: unknown,
  channel: {
    readonly connect: () => void;
    readonly line: Line;
    readonly run: Run;
    readonly status: StoreApi<LiveStatus>;
    readonly timers: LiveTimers;
  },
): void => {
  const { connect, line, run, status, timers } = channel;
  line.drop();
  timers.clear();
  status.setState({ isConnected: false });
  if (run.shouldReconnectAfter(code)) {
    timers.retryIn(retryDelay(run.failures()), connect);
  }
};

/**
A check of the session under way: the (re)connect waits for its answer and then tries again,
unless the channel was stopped meanwhile or a start since connected it (CI run 41668309388).
*/
const isWaitingForCheck = (
  options: LiveChannelOptions,
  line: Line,
  connect: () => void,
): boolean => {
  const checking = options.sessionCheck?.();
  if (checking === undefined) {
    return false;
  }
  void (async (): Promise<void> => {
    try {
      await checking;
    } catch {
      // Answered either way: the session in use (or none) decides below.
    }
    if (line.current() === undefined) {
      connect();
    }
  })();
  return true;
};

export const createLiveChannel = (options: LiveChannelOptions): LiveChannel => {
  const createSocket = options.createSocket ?? globalSocket;
  const status = createStore<LiveStatus>(() => ({ isConnected: false }));
  const timers = createTimers();
  // A quiet socket is gone as of now (its late close event is ignored: it is no longer current).
  const line = createLine(() => {
    closed(undefined);
  });
  const run: Run = createRun(options);
  const closed = (code: unknown): void => {
    whenClosed(code, { connect, line, run, status, timers });
  };
  function connect(): void {
    // Stopped: nothing to open, no waiter left. While a check of the session is under way there is
    // no session to open with: it connects once answered.
    const token =
      !run.isRunning() || isWaitingForCheck(options, line, connect) ? undefined : options.token();
    if (createSocket === undefined || token === undefined || !run.isRunning()) {
      return;
    }
    const url = liveUrl(options.baseUrl, options.deviceId);
    const socket = createSocket(url, [LIVE_V2, LIVE_V1, `pace.auth.${token}`]);
    line.use(socket);
    const opened = (): void => {
      if (line.current() === socket) {
        run.opened();
      }
      // The backoff is reset only once the socket has lived: a link that cuts it at once backs off.
      timers.stableIn(() => {
        if (line.current() === socket) {
          run.lived();
        }
      });
      timers.keepAlive(socket, (streak) => {
        // Each fresh socket that goes quiet again waits longer (`createTimers`).
        if (line.current() === socket) {
          run.wentQuiet(streak);
        }
        line.goneQuiet(socket);
      });
      status.setState({ isConnected: true });
      // A v2 socket's hello says whether anything was missed; any other catches up now.
      if (!isCaughtUpOnHello(socket)) {
        options.onChange();
      }
    };
    const on = { close: closed, open: opened, options, pong: timers.ponged };
    follow(socket, handlersFor(socket, line, on));
  }
  return {
    isV2: line.isV2,
    request: line.request,
    start: () => {
      if (run.start()) {
        connect();
      }
    },
    status,
    stop: () => {
      run.stop();
      const socket = line.current();
      // Its requests fail and v2 ends with it, before it closes.
      closed(undefined);
      socket?.close();
    },
  };
};

import { createStore, type StoreApi } from "zustand/vanilla";

type SocketEvent = "close" | "message" | "open";

/** The part of a WebSocket the channel uses (the browser's and React Native's both fit). */
export type SocketLike = {
  readonly addEventListener: (
    type: SocketEvent,
    listener: (event: { readonly data?: unknown }) => void,
  ) => void;
  readonly send: (data: string) => void;
  readonly close: () => void;
};

export type LiveStatus = { readonly isConnected: boolean };

export type LiveChannel = {
  readonly status: StoreApi<LiveStatus>;
  readonly start: () => void;
  readonly stop: () => void;
};

export type LiveChannelOptions = {
  readonly baseUrl: string;
  readonly deviceId: string;
  readonly token: () => string | undefined;
  /** Something may have changed on the server: pull. Called on every (re)connect too. */
  readonly onChange: () => void;
  /** Defaults to the global `WebSocket`; tests pass a fake. */
  readonly createSocket?: (url: string, protocols: readonly string[]) => SocketLike;
};

/** Often enough that no proxy closes an idle socket; the server answers without waking. */
const PING_MS = 45_000;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 60_000;

/** The socket's address next to the API's: `https` becomes `wss`, the device rides along. */
export const liveUrl = (baseUrl: string, deviceId: string): string => {
  const url = new URL("/api/sync/live", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${url.href}?device=${encodeURIComponent(deviceId)}`;
};

/** The platform's WebSocket; `undefined` where there is none (a test runner), and nothing opens. */
const globalSocket =
  typeof WebSocket === "undefined"
    ? undefined
    : (url: string, protocols: readonly string[]): SocketLike => new WebSocket(url, [...protocols]);

const isChanged = (data: unknown): boolean => {
  if (typeof data !== "string" || !data.startsWith("{")) {
    return false;
  }
  try {
    const parsed = JSON.parse(data) as { readonly type?: unknown };
    return parsed.type === "changed";
  } catch {
    return false;
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

/** Wires one socket: open, a `changed` message, close. */
const follow = (
  socket: SocketLike,
  on: { readonly open: () => void; readonly changed: () => void; readonly close: () => void },
): void => {
  socket.addEventListener("open", on.open);
  socket.addEventListener("message", ({ data }) => {
    if (isChanged(data)) {
      on.changed();
    }
  });
  socket.addEventListener("close", on.close);
};

/**
The server's "your log grew" line: a WebSocket to the user's store, which says `changed`
when another device, the bot or MCP writes. Each message (and each reconnect, to catch up on
what was missed) asks for a pull. Polling stays as the fallback while it is down.
*/
export const createLiveChannel = (options: LiveChannelOptions): LiveChannel => {
  const createSocket = options.createSocket ?? globalSocket;
  const status = createStore<LiveStatus>(() => ({ isConnected: false }));
  const timers = createTimers();
  let current: SocketLike | undefined;
  let failures = 0;
  let isRunning = false;
  const connect = (): void => {
    const token = options.token();
    if (createSocket === undefined || token === undefined || !isRunning) {
      return;
    }
    const url = liveUrl(options.baseUrl, options.deviceId);
    const socket = createSocket(url, ["pace.v1", `pace.auth.${token}`]);
    current = socket;
    follow(socket, {
      changed: options.onChange,
      close: () => {
        if (current !== socket) {
          return;
        }
        current = undefined;
        timers.clear();
        status.setState({ isConnected: false });
        if (!isRunning) {
          return;
        }

        failures += 1;
        timers.retryIn(retryDelay(failures), connect);
      },
      open: () => {
        failures = 0;
        timers.keepAlive(socket);
        status.setState({ isConnected: true });
        options.onChange();
      },
    });
  };
  return {
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
      timers.clear();
      const socket = current;
      current = undefined;
      socket?.close();
      status.setState({ isConnected: false });
    },
  };
};

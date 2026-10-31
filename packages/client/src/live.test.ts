import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLiveChannel, liveUrl, type SocketLike } from "./live.ts";

type FakeSocket = SocketLike & {
  readonly url: string;
  readonly protocols: readonly string[];
  readonly sent: string[];
  closed: boolean;
  /** What the server would do. */
  open: () => void;
  receive: (data: string) => void;
  drop: () => void;
};

const fakeSockets = (): {
  readonly made: FakeSocket[];
  readonly create: (url: string, protocols: readonly string[]) => SocketLike;
} => {
  const made: FakeSocket[] = [];
  return {
    create: (url, protocols) => {
      const listeners = new Map<string, ((event: { readonly data?: unknown }) => void)[]>();
      const emit = (type: string, data?: string): void => {
        const heard = listeners.get(type) ?? [];
        for (const listener of heard) {
          listener({ data });
        }
      };
      const socket: FakeSocket = {
        addEventListener: (type, listener) => {
          listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
        close: () => {
          socket.closed = true;
          emit("close");
        },
        closed: false,
        drop: () => {
          emit("close");
        },
        open: () => {
          emit("open");
        },
        protocols,
        receive: (data) => {
          emit("message", data);
        },
        send: (data) => {
          socket.sent.push(data);
        },
        sent: [],
        url,
      };
      made.push(socket);
      return socket;
    },
    made,
  };
};

describe("liveUrl", () => {
  it("turns the API's address into the socket's, with the device and the app's protocol", () => {
    expect(liveUrl("https://a.dev", "d1")).toBe("wss://a.dev/api/sync/live?device=d1&protocol=1");
    expect(liveUrl("https://api.pace.test", "dev 1")).toBe(
      "wss://api.pace.test/api/sync/live?device=dev%201&protocol=1",
    );
    expect(liveUrl("http://localhost:8787/", "d")).toBe(
      "ws://localhost:8787/api/sync/live?device=d&protocol=1",
    );
  });
});

describe("createLiveChannel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for a pull when it opens and whenever the server says the log grew", () => {
    const sockets = fakeSockets();
    const onChange = vi.fn();
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: sockets.create,
      deviceId: "dev-1",
      onChange,
      token: () => "tok",
    });
    live.start();
    const [socket] = sockets.made;
    expect(socket?.protocols).toEqual(["pace.v1", "pace.auth.tok"]);
    socket?.open();
    expect(live.status.getState().isConnected).toBe(true);
    // Catching up on whatever happened while it was not listening.
    expect(onChange).toHaveBeenCalledTimes(1);
    socket?.receive(JSON.stringify({ seq: 7, type: "changed" }));
    expect(onChange).toHaveBeenCalledTimes(2);
    socket?.receive("pong");
    socket?.receive("not json");
    expect(onChange).toHaveBeenCalledTimes(2);
    live.stop();
    expect(socket?.closed).toBe(true);
  });

  it("hands every other message (the notification pool's) to onMessage, parsed", () => {
    const sockets = fakeSockets();
    const onChange = vi.fn();
    const onMessage = vi.fn();
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: sockets.create,
      deviceId: "dev-1",
      onChange,
      onMessage,
      token: () => "tok",
    });
    live.start();
    const [socket] = sockets.made;
    socket?.open();
    socket?.receive(JSON.stringify({ id: "n-1", resolution: "attended", type: "dismiss" }));
    expect(onMessage).toHaveBeenCalledWith({ id: "n-1", resolution: "attended", type: "dismiss" });
    expect(onChange).toHaveBeenCalledTimes(1);
    live.stop();
  });

  it("keeps the socket alive with pings and reconnects with a growing pause after a drop", () => {
    const sockets = fakeSockets();
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: sockets.create,
      deviceId: "dev-1",
      onChange: () => undefined,
      token: () => "tok",
    });
    live.start();
    sockets.made[0]?.open();
    vi.advanceTimersByTime(45_000);
    expect(sockets.made[0]?.sent).toEqual(["ping"]);
    sockets.made[0]?.drop();
    expect(live.status.getState().isConnected).toBe(false);
    vi.advanceTimersByTime(999);
    expect(sockets.made).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets.made).toHaveLength(2);
    sockets.made[1]?.drop();
    vi.advanceTimersByTime(1999);
    expect(sockets.made).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets.made).toHaveLength(3);
    live.stop();
    sockets.made[2]?.drop();
    vi.advanceTimersByTime(120_000);
    expect(sockets.made).toHaveLength(3);
  });

  it("waits for a token instead of opening without one", () => {
    const sockets = fakeSockets();
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: sockets.create,
      deviceId: "dev-1",
      onChange: () => undefined,
      token: () => undefined,
    });
    live.start();
    expect(sockets.made).toHaveLength(0);
    live.stop();
  });
});

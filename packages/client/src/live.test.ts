import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LIVE_MAX_IN_FLIGHT,
  LIVE_REQUEST_TIMEOUT_MS,
  LIVE_SESSION_ENDED,
  LIVE_V2,
  type LiveClientMessage,
} from "@pace/core";

import { fakeSockets, say } from "./fake-socket.fake.ts";
import { LiveUnavailable } from "./live-requests.ts";
import { createLiveChannel, liveUrl } from "./live.ts";

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
    // The sync subprotocol first; a server that only knows v1 answers that.
    expect(socket?.protocols).toEqual(["pace.v2", "pace.v1", "pace.auth.tok"]);
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

  it("stops reconnecting when the server ends the socket's session, and says so", () => {
    const sockets = fakeSockets();
    const onSessionEnded = vi.fn();
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: sockets.create,
      deviceId: "dev-1",
      onChange: () => undefined,
      onSessionEnded,
      token: () => "tok",
    });
    live.start();
    sockets.made[0]?.open();
    sockets.made[0]?.drop(LIVE_SESSION_ENDED);
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(live.status.getState().isConnected).toBe(false);
    vi.advanceTimersByTime(120_000);
    expect(sockets.made).toHaveLength(1);
    // Started again (signed in anew, or the session turned out fine): it connects.
    live.stop();
    live.start();
    expect(sockets.made).toHaveLength(2);
    live.stop();
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

const pull = (id: string): LiveClientMessage => ({ id, since: 0, type: "pull" });

/** A channel on a fake socket that opened; `hello` says the server speaks v2. */
const openChannel = (isHello = true) => {
  const sockets = fakeSockets();
  const onChange = vi.fn();
  const onEvents = vi.fn();
  const onMessage = vi.fn();
  const live = createLiveChannel({
    baseUrl: "https://api.test",
    createSocket: sockets.create,
    deviceId: "dev-1",
    onChange,
    onEvents,
    onMessage,
    token: () => "tok",
  });
  live.start();
  const socket = sockets.made[0];
  if (socket === undefined) {
    throw new Error("no socket");
  }
  socket.open();
  if (isHello) {
    say(socket, { protocol: LIVE_V2, type: "hello" });
  }
  return { live, onChange, onEvents, onMessage, socket, sockets };
};

const page = { events: [], more: false, seq: 3, since: 2, storeId: "store-a" };

describe("createLiveChannel requests (pace.v2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("speaks v2 only after the server's hello; before it, or on v1, a request is refused at once", async () => {
    const v1 = openChannel(false);
    expect(v1.live.isV2()).toBe(false);
    await expect(v1.live.request(pull("r1"))).rejects.toBeInstanceOf(LiveUnavailable);
    expect(v1.socket.sent).toEqual([]);
    v1.live.stop();
    const v2 = openChannel();
    expect(v2.live.isV2()).toBe(true);
    // The hello is no change and no notice.
    expect(v2.onMessage).not.toHaveBeenCalled();
    v2.live.stop();
    expect(v2.live.isV2()).toBe(false);
  });

  it("answers each request with the server's message of the same id, in any order", async () => {
    const { live, socket } = openChannel();
    const first = live.request(pull("r1"));
    const second = live.request({ events: [], id: "r2", storeId: "store-a", type: "push" });
    expect(socket.sent.map((data) => JSON.parse(data) as unknown)).toEqual([
      pull("r1"),
      { events: [], id: "r2", storeId: "store-a", type: "push" },
    ]);
    say(socket, { accepted: [], id: "r2", rejected: [], seq: 4, type: "pushed" });
    say(socket, { ...page, id: "r1", type: "events" });
    await expect(first).resolves.toEqual({ ...page, id: "r1", type: "events" });
    await expect(second).resolves.toEqual({
      accepted: [],
      id: "r2",
      rejected: [],
      seq: 4,
      type: "pushed",
    });
    live.stop();
  });

  it("gives up on a request after the timeout and drops the silent socket to reconnect", async () => {
    const { live, socket, sockets } = openChannel();
    const settled = Promise.allSettled([live.request(pull("r1"))]);
    await vi.advanceTimersByTimeAsync(LIVE_REQUEST_TIMEOUT_MS - 1);
    expect(socket.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(settled).resolves.toEqual([
      { reason: expect.any(LiveUnavailable) as unknown, status: "rejected" },
    ]);
    expect(socket.closed).toBe(true);
    expect(live.isV2()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets.made).toHaveLength(2);
    live.stop();
  });

  it("reconnects after a timeout even when the quiet socket never confirms its close (half-open)", async () => {
    const { live, socket, sockets } = openChannel();
    socket.isHalfOpen = true;
    const settled = Promise.allSettled([live.request(pull("r1"))]);
    expect(live.status.getState().isConnected).toBe(true);
    await vi.advanceTimersByTimeAsync(LIVE_REQUEST_TIMEOUT_MS);
    await settled;
    expect(socket.closed).toBe(true);
    // Not connected any more (the sync polls often again), and a new socket comes.
    expect(live.status.getState().isConnected).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets.made).toHaveLength(2);
    live.stop();
  });

  it("keeps v2 on when a socket it already replaced says hello late", async () => {
    const { live, socket: first, sockets } = openChannel(false);
    first.drop();
    await vi.advanceTimersByTimeAsync(1000);
    const second = sockets.made[1];
    if (second === undefined) {
      throw new Error("no second socket");
    }
    second.open();
    say(second, { protocol: LIVE_V2, type: "hello" });
    expect(live.isV2()).toBe(true);
    say(first, { protocol: LIVE_V2, type: "hello" });
    expect(live.isV2()).toBe(true);
    live.stop();
  });

  it("works where the platform has no Promise.withResolvers (Hermes on Android)", async () => {
    const withResolvers = Object.getOwnPropertyDescriptor(Promise, "withResolvers");

    delete (Promise as { withResolvers?: unknown }).withResolvers;
    try {
      const { live, socket } = openChannel();
      const answer = live.request(pull("r1"));
      say(socket, { ...page, id: "r1", type: "events" });
      await expect(answer).resolves.toEqual({ ...page, id: "r1", type: "events" });
      live.stop();
    } finally {
      if (withResolvers !== undefined) {
        Object.defineProperty(Promise, "withResolvers", withResolvers);
      }
    }
  });

  it("keeps at most four requests open: the next one is refused without being sent", async () => {
    const { live, socket } = openChannel();
    const open = Array.from(
      { length: LIVE_MAX_IN_FLIGHT },
      async (_, index) => await live.request(pull(`r${String(index)}`)),
    );
    await expect(live.request(pull("r-extra"))).rejects.toBeInstanceOf(LiveUnavailable);
    expect(socket.sent).toHaveLength(LIVE_MAX_IN_FLIGHT);
    say(socket, { ...page, id: "r0", type: "events" });
    await open[0];
    // One answered: room for one more.
    const next = live.request(pull("r-next"));
    expect(socket.sent).toHaveLength(LIVE_MAX_IN_FLIGHT + 1);
    live.stop();
    await expect(Promise.all([...open.slice(1), next])).rejects.toBeInstanceOf(LiveUnavailable);
  });

  it("fails every open request when the socket drops", async () => {
    const { live, socket } = openChannel();
    const request = live.request(pull("r1"));
    socket.drop();
    await expect(request).rejects.toBeInstanceOf(LiveUnavailable);
    expect(live.isV2()).toBe(false);
    live.stop();
  });

  it("hands new events the server sends unasked to onEvents; ignores a type it does not know", () => {
    const { live, onChange, onEvents, onMessage, socket } = openChannel();
    say(socket, { ...page, type: "events" });
    expect(onEvents).toHaveBeenCalledWith(page);
    // A late answer to a request already given up on is still a page of events.
    say(socket, { ...page, id: "gone", type: "events" });
    expect(onEvents).toHaveBeenCalledTimes(2);
    socket.receive(JSON.stringify({ type: "from-the-future", x: 1 }));
    say(socket, { accepted: [], id: "gone", rejected: [], seq: 1, type: "pushed" });
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onMessage).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(1);
    live.stop();
  });
});

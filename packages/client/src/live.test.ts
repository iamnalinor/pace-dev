import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LIVE_MAX_IN_FLIGHT,
  LIVE_REQUEST_TIMEOUT_MS,
  LIVE_SESSION_ENDED,
  LIVE_V1,
  LIVE_V2,
  type LiveClientMessage,
} from "@pace/core";

import { fakeSockets, say } from "./fake-socket.fake.ts";
import { LiveUnavailable } from "./live-requests.ts";
import { PONG_WAIT_MS, STABLE_MS } from "./live-timers.ts";
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

  it("opens no socket with the session while a check of it is under way, and one after a check that kept it (CI run 41668309388)", async () => {
    const sockets = fakeSockets();
    const check = { pending: Promise.withResolvers<null>() as null | PromiseWithResolvers<null> };
    let token: string | undefined = "tok";
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: sockets.create,
      deviceId: "dev-1",
      onChange: vi.fn(),
      sessionCheck: (): Promise<null> | undefined => check.pending?.promise,
      token: () => token,
    });
    live.start();
    // Started again while it waits: still one socket once the check is answered.
    live.stop();
    live.start();
    expect(sockets.made).toHaveLength(0);
    const kept = check.pending;
    check.pending = null;
    kept?.resolve(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(sockets.made).toHaveLength(1);
    expect(sockets.made[0]?.protocols).toContain("pace.auth.tok");
    live.stop();
    // A check that ended the session: no socket after it.
    check.pending = Promise.withResolvers<null>();
    live.start();
    token = undefined;
    const ended = check.pending;
    check.pending = null;
    ended.resolve(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(sockets.made).toHaveLength(1);
    live.stop();
  });

  it("a stopped channel leaves no waiter behind for a check under way (CI fix review m5)", async () => {
    const first = Promise.withResolvers<null>();
    const second = Promise.withResolvers<null>();
    const check: { pending: Promise<null> | undefined } = { pending: first.promise };
    const sessionCheck = vi.fn((): Promise<null> | undefined => check.pending);
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: fakeSockets().create,
      deviceId: "dev-1",
      onChange: vi.fn(),
      sessionCheck,
      token: () => "tok",
    });
    live.start();
    live.stop();
    // The first check is answered while a second is under way: the stopped channel waits on neither.
    check.pending = second.promise;
    first.resolve(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(sessionCheck).toHaveBeenCalledTimes(1);
    second.resolve(null);
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

  it("takes a ping left without its pong as a quiet socket: reconnects within seconds (QA round 16 L1)", () => {
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
    socket?.open();
    // A healthy line: the pong comes and the socket stays.
    vi.advanceTimersByTime(45_000 + 30_000);
    expect(live.status.getState().isConnected).toBe(true);
    // The network switched: the socket reads as open, but nothing comes back, not even its close.
    if (socket !== undefined) {
      socket.answersPing = false;
      socket.isHalfOpen = true;
    }
    // The next ping goes at 90 s; its pong never comes.
    vi.advanceTimersByTime(15_000 + PONG_WAIT_MS - 1);
    expect(live.status.getState().isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(live.status.getState().isConnected).toBe(false);
    expect(socket?.closed).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(sockets.made).toHaveLength(2);
    sockets.made[1]?.open();
    // Back on the line: it catches up on what it missed.
    expect(onChange).toHaveBeenCalledTimes(2);
    live.stop();
  });

  it("keeps a socket whose pong comes late but in time (fix round 1)", () => {
    const sockets = fakeSockets();
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: sockets.create,
      deviceId: "dev-1",
      onChange: () => undefined,
      token: () => "tok",
    });
    live.start();
    const [socket] = sockets.made;
    socket?.open();
    if (socket !== undefined) {
      socket.answersPing = false;
    }
    vi.advanceTimersByTime(45_000 + PONG_WAIT_MS - 1);
    socket?.receive("pong");
    vi.advanceTimersByTime(30_000);
    expect(live.status.getState().isConnected).toBe(true);
    expect(sockets.made).toHaveLength(1);
    live.stop();
  });

  it("waits longer each time a fresh socket goes quiet again, until a pong comes (fix round 1)", () => {
    const sockets = fakeSockets();
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: sockets.create,
      deviceId: "dev-1",
      onChange: () => undefined,
      token: () => "tok",
    });
    live.start();
    /** The newest socket opens and never answers a ping: dropped one ping and 10 s later. */
    const quietOnce = (): void => {
      const socket = sockets.made.at(-1);
      if (socket !== undefined) {
        socket.answersPing = false;
        socket.isHalfOpen = true;
        socket.open();
      }
      vi.advanceTimersByTime(45_000 + PONG_WAIT_MS);
    };
    quietOnce();
    vi.advanceTimersByTime(999);
    expect(sockets.made).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets.made).toHaveLength(2);
    // Quiet again right after it opened: the pause doubles instead of starting over.
    quietOnce();
    vi.advanceTimersByTime(1999);
    expect(sockets.made).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets.made).toHaveLength(3);
    // A healthy socket (its pong comes) starts the count over.
    sockets.made[2]?.open();
    vi.advanceTimersByTime(45_000);
    sockets.made[2]?.drop();
    vi.advanceTimersByTime(1000);
    expect(sockets.made).toHaveLength(4);
    live.stop();
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

  it("says a connected socket dropped once, not for its failed reconnects, a stop or a session end (QA 18 M4)", () => {
    const sockets = fakeSockets();
    const onDropped = vi.fn();
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: sockets.create,
      deviceId: "dev-1",
      onChange: vi.fn(),
      onDropped,
      token: () => "tok",
    });
    live.start();
    sockets.made[0]?.open();
    vi.advanceTimersByTime(STABLE_MS);
    sockets.made[0]?.drop();
    expect(onDropped).toHaveBeenCalledTimes(1);
    // The reconnects fail without ever opening: nothing more.
    vi.advanceTimersByTime(1000);
    sockets.made[1]?.drop();
    vi.advanceTimersByTime(2000);
    sockets.made[2]?.drop();
    expect(onDropped).toHaveBeenCalledTimes(1);
    // A stop of a connected socket (a hidden tab, a log-out) is no drop.
    vi.advanceTimersByTime(4000);
    sockets.made[3]?.open();
    live.stop();
    expect(onDropped).toHaveBeenCalledTimes(1);
    // Nor is the server ending the session.
    live.start();
    sockets.made[4]?.open();
    sockets.made[4]?.drop(LIVE_SESSION_ENDED);
    expect(onDropped).toHaveBeenCalledTimes(1);
  });

  it("backs off a socket cut soon after it opens, and says no drop for it (fix round 5 V2)", () => {
    const sockets = fakeSockets();
    const onDropped = vi.fn();
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: sockets.create,
      deviceId: "dev-1",
      onChange: vi.fn(),
      onDropped,
      token: () => "tok",
    });
    live.start();
    // Let in and cut 100 ms on, again and again: 1 s, 2 s, 4 s between tries, as for a refusal.
    for (const [index, wait] of [1000, 2000, 4000].entries()) {
      sockets.made[index]?.open();
      vi.advanceTimersByTime(100);
      sockets.made[index]?.drop();
      vi.advanceTimersByTime(wait - 1);
      expect(sockets.made).toHaveLength(index + 1);
      vi.advanceTimersByTime(1);
      expect(sockets.made).toHaveLength(index + 2);
    }
    expect(onDropped).not.toHaveBeenCalled();
    // One that stays up resets the backoff: its drop is said, and the next try comes after 1 s.
    sockets.made[3]?.open();
    vi.advanceTimersByTime(STABLE_MS);
    sockets.made[3]?.drop();
    expect(onDropped).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(sockets.made).toHaveLength(5);
    live.stop();
  });

  it("says a socket closed before it ever opened once per streak of such failures (round 7 CI)", () => {
    // Refused at the door (its session ended while it was connecting, or no server): a browser
    // gives a refused upgrade no close code, so the app must look for itself.
    const sockets = fakeSockets();
    const onFailedToOpen = vi.fn();
    const onDropped = vi.fn();
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: sockets.create,
      deviceId: "dev-1",
      onChange: vi.fn(),
      onDropped,
      onFailedToOpen,
      token: () => "tok",
    });
    live.start();
    sockets.made[0]?.drop();
    expect(onFailedToOpen).toHaveBeenCalledTimes(1);
    // Its reconnects are refused too: still once.
    vi.advanceTimersByTime(1000);
    sockets.made[1]?.drop();
    vi.advanceTimersByTime(2000);
    sockets.made[2]?.drop();
    expect(onFailedToOpen).toHaveBeenCalledTimes(1);
    // One that opens ends the streak; a socket cut after it opened is no refusal.
    vi.advanceTimersByTime(4000);
    sockets.made[3]?.open();
    vi.advanceTimersByTime(STABLE_MS);
    sockets.made[3]?.drop();
    expect(onFailedToOpen).toHaveBeenCalledTimes(1);
    expect(onDropped).toHaveBeenCalledTimes(1);
    // The next refusal starts a new streak; a stop says nothing.
    vi.advanceTimersByTime(1000);
    sockets.made[4]?.drop();
    expect(onFailedToOpen).toHaveBeenCalledTimes(2);
    live.stop();
    live.start();
    live.stop();
    expect(onFailedToOpen).toHaveBeenCalledTimes(2);
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

/** A channel whose socket opened as `protocol`; the server has not spoken yet. */
const opened = (protocol: string | undefined) => {
  const sockets = fakeSockets();
  const onChange = vi.fn();
  const onHello = vi.fn();
  const live = createLiveChannel({
    baseUrl: "https://api.test",
    createSocket: sockets.create,
    deviceId: "dev-1",
    onChange,
    onHello,
    token: () => "tok",
  });
  live.start();
  const socket = sockets.made[0];
  if (socket === undefined) {
    throw new Error("no socket");
  }
  socket.protocol = protocol;
  socket.open();
  return { live, onChange, onHello, socket };
};

describe("createLiveChannel catching up on connect (QA PR55-1-12)", () => {
  it("leaves a v2 socket's catch-up to its hello, which names where the log stands", () => {
    const { live, onChange, onHello, socket } = opened(LIVE_V2);
    expect(onChange).not.toHaveBeenCalled();
    say(socket, { protocol: LIVE_V2, seq: 43, storeId: "store-a", type: "hello" });
    expect(onHello).toHaveBeenCalledExactlyOnceWith({ seq: 43, storeId: "store-a" });
    expect(onChange).not.toHaveBeenCalled();
    live.stop();
  });

  it("asks for a pull on a hello that names nothing (an older server)", () => {
    const { live, onChange, onHello, socket } = opened(LIVE_V2);
    say(socket, { protocol: LIVE_V2, type: "hello" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onHello).not.toHaveBeenCalled();
    live.stop();
  });

  it("asks for a pull on open when the socket speaks v1, or does not say", () => {
    for (const protocol of [LIVE_V1, undefined]) {
      const { live, onChange } = opened(protocol);
      expect(onChange).toHaveBeenCalledTimes(1);
      live.stop();
    }
  });
});

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

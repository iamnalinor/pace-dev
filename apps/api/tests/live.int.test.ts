import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { endpoints, LIVE_SESSION_ENDED, LiveServerMessageSchema, newId } from "@pace/core";

import { LIVE_EXPIRES_HEADER, LIVE_SESSION_HEADER } from "../src/shared/socket-auth.ts";
import { replyCloseCode } from "../src/user-store/live-sockets.ts";
import { answerOf, api, call, json, loginAsDev, pushEvents, storeIdOf } from "./helpers.ts";

type LiveMessage = ReturnType<typeof LiveServerMessageSchema.parse>;
type Events = Extract<LiveMessage, { type: "events" }>;
type StoredEvent = { readonly deviceId: string; readonly id: string };

/** A complete task.created event written on the phone. */
const event = () => ({
  deviceId: "phone-1",
  id: newId(),
  occurredAt: "2026-10-06T09:00:00.000Z",
  payload: { fields: {}, presetId: "preset-work", subtasks: [], taskId: newId(), title: "t" },
  precision: "exact",
  recordedAt: "2026-10-06T09:00:01.000Z",
  source: "app",
  type: "task.created",
});

/** A daily series the phone wrote: the store derives its next instance as a system event. */
const seriesEvents = (deviceId: string) => {
  const now = new Date().toISOString();
  const seriesId = newId();
  const taskId = newId();
  const template = {
    fields: {},
    presetId: "personal",
    seriesId,
    seriesRevision: 0,
    startAt: new Date(Date.now() - 86_400_000).toISOString(),
    startTz: "UTC",
    subtasks: [],
    taskId,
    title: "Read",
  };
  const envelope = { deviceId, occurredAt: now, precision: "exact", recordedAt: now };
  return [
    {
      ...envelope,
      id: newId(),
      payload: { schedule: { kind: "daily" }, seriesId, template },
      source: "app",
      type: "series.created",
    },
    { ...envelope, id: taskId, payload: template, source: "app", type: "task.created" },
  ];
};

/**
Every message a socket receives, in order. A JSON one is read through the socket's own answer
schema (class 12): a server message off the contract fails the test where it arrives.
*/
type Inbox = {
  readonly socket: WebSocket;
  /** The next message, or `null` when none comes within half a second. */
  readonly next: () => Promise<LiveMessage | null | string>;
  /** Everything that arrives until the socket has been quiet for half a second. */
  readonly drain: () => Promise<readonly (LiveMessage | string)[]>;
  /** The messages up to and including the first of `type` (fails when it never comes). */
  readonly until: <T extends LiveMessage["type"]>(
    type: T,
  ) => Promise<readonly [readonly (LiveMessage | string)[], Extract<LiveMessage, { type: T }>]>;
  /** The code the socket closed with, or `null` when it is still open a second later. */
  readonly closed: () => Promise<null | number>;
};

const read = (data: string): LiveMessage | string =>
  data.startsWith("{") ? LiveServerMessageSchema.parse(JSON.parse(data)) : data;

const inboxOf = (socket: WebSocket): Inbox => {
  const queue: string[] = [];
  const waiters: ((data: string) => void)[] = [];
  const closing: { code?: number; readonly waiters: ((code: number) => void)[] } = { waiters: [] };
  socket.addEventListener("close", (event) => {
    closing.code = event.code;
    for (const waiter of closing.waiters.splice(0)) {
      waiter(event.code);
    }
  });
  const closed = async (): Promise<null | number> =>
    closing.code ??
    (await new Promise<null | number>((resolve) => {
      const timer = setTimeout(() => {
        resolve(null);
      }, 1000);
      closing.waiters.push((code) => {
        clearTimeout(timer);
        resolve(code);
      });
    }));
  socket.addEventListener("message", (message) => {
    const data = String(message.data);
    const waiter = waiters.shift();
    if (waiter === undefined) {
      queue.push(data);
    } else {
      waiter(data);
    }
  });
  const next = async (): Promise<LiveMessage | null | string> => {
    const queued = queue.shift();
    if (queued !== undefined) {
      return read(queued);
    }
    const data = await new Promise<null | string>((resolve) => {
      const waiter = (received: string): void => {
        clearTimeout(timer);
        resolve(received);
      };
      const timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        resolve(null);
      }, 500);
      waiters.push(waiter);
    });
    return data === null ? null : read(data);
  };
  const drain = async (): Promise<readonly (LiveMessage | string)[]> => {
    const seen: (LiveMessage | string)[] = [];
    for (let message = await next(); message !== null; message = await next()) {
      seen.push(message);
    }
    return seen;
  };
  const until = async <T extends LiveMessage["type"]>(
    type: T,
  ): Promise<readonly [readonly (LiveMessage | string)[], Extract<LiveMessage, { type: T }>]> => {
    const seen: (LiveMessage | string)[] = [];
    for (let message = await next(); message !== null; message = await next()) {
      seen.push(message);
      if (typeof message !== "string" && message.type === type) {
        return [seen, message as Extract<LiveMessage, { type: T }>];
      }
    }
    throw new Error(`no ${type} message; got ${JSON.stringify(seen)}`);
  };
  return { closed, drain, next, socket, until };
};

/** Opens the live channel the way a browser does: the token rides in the subprotocols. */
const open = async (
  token: string,
  device = "phone-1",
  protocols = "pace.v1",
): Promise<{ readonly response: Response; readonly socket: null | WebSocket }> => {
  const response = await api.fetch(
    new Request(`https://pace-api.test/api/sync/live?device=${device}`, {
      headers: {
        "Sec-WebSocket-Protocol": `${protocols}, pace.auth.${token}`,
        Upgrade: "websocket",
      },
    }),
  );
  const socket = response.webSocket;
  socket?.accept();
  return { response, socket };
};

/** A v2 socket past its `hello`, with every message it gets from then on. */
const openV2 = async (token: string, device: string): Promise<Inbox> => {
  const { socket } = await open(token, device, "pace.v2, pace.v1");
  if (socket === null) {
    throw new Error("no socket");
  }
  const inbox = inboxOf(socket);
  expect(await inbox.next()).toEqual({ protocol: "pace.v2", type: "hello" });
  return inbox;
};

/** A v1 socket, with every message it gets. */
const openV1 = async (token: string, device: string): Promise<Inbox> => {
  const { socket } = await open(token, device);
  if (socket === null) {
    throw new Error("no socket");
  }
  return inboxOf(socket);
};

/** The session a token belongs to, as Settings lists it. */
const sessionIdOf = async (token: string): Promise<string> => {
  const { sessions } = await answerOf(endpoints.sessions.list, "/api/sessions", { token });
  return sessions.find((session) => session.current)?.id ?? "";
};

/** Waits out a short session (real time: the store compares with the clock). */
const wait = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const userStore = async (token: string) => {
  const me = await json<{ id: string }>("/api/me", { token });
  return env.USER_STORE.get(env.USER_STORE.idFromName(me.id));
};

/** The first sign-in notice a fresh v1 socket of `token` hears, as it is sent to that socket. */
const heardSignIn = async (
  token: string,
  device: string,
): Promise<{ readonly readAt: null | string }> => {
  const { socket } = await open(token, device);
  if (socket === null) {
    throw new Error("no socket");
  }
  return await new Promise((resolve) => {
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data)) as {
        readonly type: string;
        readonly notification?: { readonly kind: string; readonly readAt: null | string };
      };
      if (!(message.type === "notification" && message.notification?.kind === "login")) {
        return;
      }

      socket.close();
      resolve(message.notification);
    });
  });
};

/*
The race of the final review: the Worker reads the session in D1 and forwards the upgrade, and the
revoke (D1 delete, then `endLiveSessions`) lands in between. The upgrade reaching the store
afterwards must be refused, or the ended session keeps a socket until its expiry.
*/
const upgradeHeldPastRevoke = async (
  store: Awaited<ReturnType<typeof userStore>>,
  sessionId: string,
): Promise<Response> => {
  const headers = {
    [LIVE_EXPIRES_HEADER]: String(Date.now() + 86_400_000),
    [LIVE_SESSION_HEADER]: sessionId,
    "Sec-WebSocket-Protocol": "pace.v2",
    Upgrade: "websocket",
  };
  const request = new Request("https://pace-api.test/api/sync/live?device=phone-1", { headers });
  return await store.fetch(request);
};

/** The log's latest sequence number (an empty push answers it). */
const latestSeq = async (token: string): Promise<number> =>
  (await pushEvents<{ seq: number }>(token, [])).seq;

const idsOf = (events: readonly unknown[]): readonly string[] =>
  (events as readonly StoredEvent[]).map((item) => item.id);

const eventsIn = (messages: readonly (LiveMessage | string)[]): readonly Events[] =>
  messages.filter(
    (message): message is Events => typeof message !== "string" && message.type === "events",
  );

describe("live sync channel", () => {
  it("tells another device as soon as the log grows, with the new sequence", async () => {
    const token = await loginAsDev("1001");
    const { response, socket } = await open(token, "laptop-1");
    expect(response.status).toBe(101);
    expect(response.headers.get("Sec-WebSocket-Protocol")).toBe("pace.v1");
    if (socket === null) {
      throw new Error("no socket");
    }
    const inbox = inboxOf(socket);
    await pushEvents(token, [event()]);
    expect(await inbox.next()).toEqual({ seq: 1, type: "changed" });
    socket.close();
  });

  it("does not echo a device's own push back to it", async () => {
    const token = await loginAsDev("1001");
    const { socket } = await open(token, "phone-1");
    if (socket === null) {
      throw new Error("no socket");
    }
    const inbox = inboxOf(socket);
    await pushEvents(token, [event()]);
    expect(await inbox.next()).toBeNull();
    socket.close();
  });

  it("answers a ping without waking the store's logic", async () => {
    const token = await loginAsDev("1001");
    const { socket } = await open(token);
    if (socket === null) {
      throw new Error("no socket");
    }
    const inbox = inboxOf(socket);
    socket.send("ping");
    expect(await inbox.next()).toBe("pong");
    socket.close();
  });

  it("closes in answer with a code a socket may send, whatever the device's close said", () => {
    // 1005 (no code), 1006 (dropped) and 1015 (TLS) are only ever received; 1004 and 1015–2999
    // are reserved, past 4999 is no code at all: sending any of them throws.
    for (const received of [0, 999, 1004, 1005, 1006, 1015, 1016, 2999, 5000]) {
      expect(replyCloseCode(received)).toBe(1000);
    }
    for (const sent of [1000, 1001, 1002, 1003, 1007, 1011, 1014, 3000, 4001, 4999]) {
      expect(replyCloseCode(sent)).toBe(sent);
    }
  });

  it("refuses a missing or wrong token, and a plain request", async () => {
    expect((await open("nope")).response.status).toBe(401);
    const plain = await api.fetch(new Request("https://pace-api.test/api/sync/live"));
    expect(plain.status).toBe(426);
  });
});

describe("live sync channel, pace.v2", () => {
  it("speaks v2 when the app offers it, and says hello first", async () => {
    const token = await loginAsDev("1001");
    const { response, socket } = await open(token, "phone-1", "pace.v2, pace.v1");
    expect(response.status).toBe(101);
    expect(response.headers.get("Sec-WebSocket-Protocol")).toBe("pace.v2");
    if (socket === null) {
      throw new Error("no socket");
    }
    expect(await inboxOf(socket).next()).toEqual({ protocol: "pace.v2", type: "hello" });
    socket.close();
  });

  it("serves a v1 socket as before: no hello, its requests unanswered", async () => {
    const token = await loginAsDev("1001");
    const v1 = await openV1(token, "phone-1");
    v1.socket.send(JSON.stringify({ id: "p", since: 0, type: "pull" }));
    expect(await v1.next()).toBeNull();
    v1.socket.close();
  });

  it("pushes over the socket: the writer gets pushed, another device gets the events", async () => {
    const token = await loginAsDev("1001");
    const before = await latestSeq(token);
    const count = await (await userStore(token)).countEvents();
    const writer = await openV2(token, "phone-1");
    const other = await openV2(token, "laptop-1");
    const batch = [event(), event()];
    writer.socket.send(
      JSON.stringify({ events: batch, id: "r-1", storeId: await storeIdOf(token), type: "push" }),
    );
    const [seen, pushed] = await writer.until("pushed");
    expect(pushed).toEqual({
      accepted: idsOf(batch),
      id: "r-1",
      rejected: [],
      seq: before + 2,
      type: "pushed",
    });
    expect(eventsIn(seen)).toEqual([]);
    expect(await (await userStore(token)).countEvents()).toBe(count + 2);
    const [, events] = await other.until("events");
    expect(events).toMatchObject({ more: false, seq: before + 2, since: before });
    expect(events.id).toBeUndefined();
    expect(events.events).toEqual(batch);
    expect(events.storeId).toBe(await storeIdOf(token));
    expect(eventsIn(await writer.drain())).toEqual([]);
    writer.socket.close();
    other.socket.close();
  });

  it("tells the writer about the system events its batch led to, not about its batch", async () => {
    const token = await loginAsDev("1001");
    const writer = await openV2(token, "phone-1");
    const other = await openV2(token, "laptop-1");
    const batch = seriesEvents("phone-1");
    writer.socket.send(
      JSON.stringify({ events: batch, id: "r-2", storeId: await storeIdOf(token), type: "push" }),
    );
    const [seen, pushed] = await writer.until("pushed");
    expect(pushed.accepted).toEqual(idsOf(batch));
    const derived = eventsIn([...seen, ...(await writer.drain())]).flatMap(
      (message) => message.events as readonly StoredEvent[],
    );
    expect(derived.length).toBeGreaterThan(0);
    expect(derived.every((item) => item.deviceId === "server")).toBe(true);
    const toOther = eventsIn(await other.drain()).flatMap((message) => idsOf(message.events));
    expect(toOther).toEqual([...idsOf(batch), ...derived.map((item) => item.id)]);
    writer.socket.close();
    other.socket.close();
  });

  it("accepts the same push again without a second copy when its answer was lost", async () => {
    const token = await loginAsDev("1001");
    const store = await userStore(token);
    const writer = await openV2(token, "phone-1");
    const other = await openV2(token, "laptop-1");
    const message = JSON.stringify({
      events: [event(), event()],
      id: "r-3",
      storeId: await storeIdOf(token),
      type: "push",
    });
    writer.socket.send(message);
    const [, first] = await writer.until("pushed");
    const count = await store.countEvents();
    expect(eventsIn(await other.drain())).toHaveLength(1);
    writer.socket.send(message);
    const [, again] = await writer.until("pushed");
    expect(again).toEqual(first);
    expect(await store.countEvents()).toBe(count);
    expect(eventsIn(await other.drain())).toEqual([]);
    writer.socket.close();
    other.socket.close();
  });

  it("refuses a push meant for another store, writing nothing", async () => {
    const token = await loginAsDev("1001");
    const store = await userStore(token);
    const count = await store.countEvents();
    const writer = await openV2(token, "phone-1");
    writer.socket.send(
      JSON.stringify({ events: [event()], id: "r-4", storeId: "an-older-store", type: "push" }),
    );
    expect(await writer.next()).toEqual({ code: "store/changed", id: "r-4", type: "error" });
    expect(await store.countEvents()).toBe(count);
    writer.socket.close();
  });

  it("answers a pull in pages until the end, echoing its id", async () => {
    const token = await loginAsDev("1001");
    const before = await latestSeq(token);
    const batch = [event(), event(), event(), event(), event()];
    await pushEvents(token, batch);
    const reader = await openV2(token, "laptop-1");
    const pages: Events[] = [];
    let since = before;
    let isMore = true;
    while (isMore) {
      reader.socket.send(JSON.stringify({ id: `p-${since}`, limit: 2, since, type: "pull" }));
      const [, page] = await reader.until("events");
      expect(page.id).toBe(`p-${since}`);
      expect(page.since).toBe(since);
      pages.push(page);
      ({ more: isMore, seq: since } = page);
    }
    expect(pages.map((page) => [page.events.length, page.more])).toEqual([
      [2, true],
      [2, true],
      [1, false],
    ]);
    expect(pages.flatMap((page) => idsOf(page.events))).toEqual(idsOf(batch));
    expect(pages.at(-1)?.seq).toBe(before + 5);
    reader.socket.send(JSON.stringify({ id: "all", since: before, type: "pull" }));
    const [, all] = await reader.until("events");
    expect(idsOf(all.events)).toEqual(idsOf(batch));
    reader.socket.close();
  });

  it("answers a malformed message with bad-request and stays open", async () => {
    const token = await loginAsDev("1001");
    const socket = await openV2(token, "phone-1");
    socket.socket.send("not json");
    expect(await socket.next()).toEqual({ code: "bad-request", id: "", type: "error" });
    socket.socket.send(JSON.stringify({ id: "r-5", storeId: "s", type: "push" }));
    expect(await socket.next()).toEqual({ code: "bad-request", id: "r-5", type: "error" });
    socket.socket.send(JSON.stringify({ id: "p", since: 0, type: "pull" }));
    const [, page] = await socket.until("events");
    expect(page.id).toBe("p");
    socket.socket.close();
  });

  it("sends an HTTP push's events to v2 sockets and changed to v1 ones", async () => {
    const token = await loginAsDev("1001");
    const before = await latestSeq(token);
    const v2 = await openV2(token, "laptop-1");
    const v1 = await openV1(token, "tablet-1");
    const batch = [event()];
    await pushEvents(token, batch);
    const [, events] = await v2.until("events");
    expect(events).toMatchObject({ more: false, seq: before + 1, since: before });
    expect(idsOf(events.events)).toEqual(idsOf(batch));
    expect(await v1.next()).toEqual({ seq: before + 1, type: "changed" });
    v2.socket.close();
    v1.socket.close();
  });

  it("announces a batch too big for one message as more, for a pull", async () => {
    const token = await loginAsDev("1001");
    const before = await latestSeq(token);
    const v2 = await openV2(token, "laptop-1");
    await pushEvents(
      token,
      Array.from({ length: 250 }, () => event()),
    );
    const [, events] = await v2.until("events");
    expect(events).toMatchObject({ events: [], more: true, seq: before + 250, since: before });
    v2.socket.close();
  });
});

describe("live sockets end with their session", () => {
  it("closes a revoked session's sockets, v1 and v2, and keeps the others open", async () => {
    const [ended, kept] = [await loginAsDev("1001"), await loginAsDev("1001")];
    const endedV2 = await openV2(ended, "phone-1");
    const endedV1 = await openV1(ended, "phone-2");
    const keptV2 = await openV2(kept, "laptop-1");
    const revoked = await call(`/api/sessions/${await sessionIdOf(ended)}`, {
      method: "DELETE",
      token: kept,
    });
    expect(revoked.status).toBe(200);
    expect(await endedV2.closed()).toBe(LIVE_SESSION_ENDED);
    expect(await endedV1.closed()).toBe(LIVE_SESSION_ENDED);
    await pushEvents(kept, [event()]);
    expect(eventsIn(await endedV2.drain())).toEqual([]);
    expect(await endedV1.next()).toBeNull();
    const [, events] = await keptV2.until("events");
    expect(events.events).toHaveLength(1);
    expect(await keptV2.closed()).toBeNull();
    keptV2.socket.close();
  });

  it("closes the socket of a session ended with Not me", async () => {
    const [intruder, owner] = [await loginAsDev("1001"), await loginAsDev("1001")];
    const intruderV2 = await openV2(intruder, "phone-1");
    const ownerV2 = await openV2(owner, "laptop-1");
    const sessionId = await sessionIdOf(intruder);
    const notice = await (await userStore(owner)).notify(
      {
        kind: "login",
        payload: { country: "", ip: "", kind: "dev", name: "Dev login", sessionId },
      },
      new Date().toISOString(),
    );
    if (!notice.ok) {
      throw new Error(notice.error.code);
    }
    const answered = await call(`/api/notifications/${notice.value.id}/resolve`, {
      body: { from: "web", resolution: "revoked" },
      token: owner,
    });
    expect(answered.status).toBe(200);
    expect(await intruderV2.closed()).toBe(LIVE_SESSION_ENDED);
    ownerV2.socket.send(JSON.stringify({ id: "p", since: 0, type: "pull" }));
    const [, page] = await ownerV2.until("events");
    expect(page.id).toBe("p");
    ownerV2.socket.close();
  });

  it("tells the session a sign-in reports of its notice as read, the person's others as unread", async () => {
    const [reported, owner] = [await loginAsDev("1001"), await loginAsDev("1001")];
    const reportedHears = heardSignIn(reported, "phone-1");
    const ownerHears = heardSignIn(owner, "laptop-1");
    const sessionId = await sessionIdOf(reported);
    await (await userStore(owner)).notify(
      {
        kind: "login",
        payload: { country: "", ip: "", kind: "dev", name: "Dev login", sessionId },
      },
      new Date().toISOString(),
    );
    expect((await reportedHears).readAt).not.toBeNull();
    expect((await ownerHears).readAt).toBeNull();
  });

  it("closes the socket of a session that logs out", async () => {
    const token = await loginAsDev("1001");
    const socket = await openV2(token, "phone-1");
    expect((await call("/api/auth/logout", { method: "POST", token })).status).toBe(200);
    expect(await socket.closed()).toBe(LIVE_SESSION_ENDED);
  });

  it("closes every socket of an account that is deleted", async () => {
    const [first, second] = [await loginAsDev("1002"), await loginAsDev("1002")];
    const sockets = [await openV2(first, "phone-1"), await openV1(second, "laptop-1")];
    expect((await call("/api/test/account", { method: "DELETE", token: first })).status).toBe(200);
    for (const socket of sockets) {
      expect(await socket.closed()).toBe(LIVE_SESSION_ENDED);
    }
  });

  it("stops serving a socket whose session expired: no pull, no events", async () => {
    const token = await loginAsDev("1001");
    const store = await userStore(token);
    // The Worker names the session and its expiry; here it expires in a moment.
    const expiresAt = String(Date.now() + 300);
    const openShort = async (device: string): Promise<Inbox> => {
      const response = await store.fetch(
        new Request(`https://pace-api.test/api/sync/live?device=${device}`, {
          headers: {
            [LIVE_EXPIRES_HEADER]: expiresAt,
            [LIVE_SESSION_HEADER]: "short-session",
            "Sec-WebSocket-Protocol": "pace.v2",
            Upgrade: "websocket",
          },
        }),
      );
      const socket = response.webSocket;
      if (socket === null) {
        throw new Error("no socket");
      }
      socket.accept();
      const inbox = inboxOf(socket);
      expect(await inbox.next()).toEqual({ protocol: "pace.v2", type: "hello" });
      return inbox;
    };
    const puller = await openShort("laptop-1");
    const listener = await openShort("laptop-2");
    await wait(400);
    puller.socket.send(JSON.stringify({ id: "p", since: 0, type: "pull" }));
    expect(await puller.closed()).toBe(LIVE_SESSION_ENDED);
    expect(eventsIn(await puller.drain())).toEqual([]);
    await pushEvents(token, [event()]);
    expect(await listener.closed()).toBe(LIVE_SESSION_ENDED);
    expect(eventsIn(await listener.drain())).toEqual([]);
  });

  it("takes the session from the Worker, never from the app's own headers", async () => {
    const token = await loginAsDev("1001");
    const response = await api.fetch(
      new Request("https://pace-api.test/api/sync/live?device=phone-1", {
        headers: {
          [LIVE_EXPIRES_HEADER]: "1",
          [LIVE_SESSION_HEADER]: "someone-else",
          "Sec-WebSocket-Protocol": `pace.v2, pace.auth.${token}`,
          Upgrade: "websocket",
        },
      }),
    );
    const socket = response.webSocket;
    if (socket === null) {
      throw new Error("no socket");
    }
    socket.accept();
    const inbox = inboxOf(socket);
    expect(await inbox.next()).toEqual({ protocol: "pace.v2", type: "hello" });
    socket.send(JSON.stringify({ id: "p", since: 0, type: "pull" }));
    const [, page] = await inbox.until("events");
    expect(page.id).toBe("p");
    socket.close();
  });

  it("refuses an upgrade that checked the session before a revoke and reaches the store after it", async () => {
    const [ended, kept] = [await loginAsDev("1001"), await loginAsDev("1001")];
    const store = await userStore(kept);
    // The Worker's check passed while the session was still there.
    const sessionId = await sessionIdOf(ended);
    const revoked = await call(`/api/sessions/${sessionId}`, { method: "DELETE", token: kept });
    expect(revoked.status).toBe(200);
    const late = await upgradeHeldPastRevoke(store, sessionId);
    expect(late.status).toBe(401);
    expect(late.webSocket).toBeNull();
    // Another session of the same person still opens.
    const keptSocket = await openV2(kept, "laptop-1");
    expect(await keptSocket.closed()).toBeNull();
    keptSocket.socket.close();
  });

  it("refuses the late upgrade of a session ended with Not me, and of one that logged out", async () => {
    const [intruder, owner, leaver] = [
      await loginAsDev("1001"),
      await loginAsDev("1001"),
      await loginAsDev("1001"),
    ];
    const store = await userStore(owner);
    const intruderId = await sessionIdOf(intruder);
    const leaverId = await sessionIdOf(leaver);
    const notice = await store.notify(
      {
        kind: "login",
        payload: { country: "", ip: "", kind: "dev", name: "Dev login", sessionId: intruderId },
      },
      new Date().toISOString(),
    );
    if (!notice.ok) {
      throw new Error(notice.error.code);
    }
    const answered = await call(`/api/notifications/${notice.value.id}/resolve`, {
      body: { from: "web", resolution: "revoked" },
      token: owner,
    });
    expect(answered.status).toBe(200);
    expect((await call("/api/auth/logout", { method: "POST", token: leaver })).status).toBe(200);
    for (const sessionId of [intruderId, leaverId]) {
      const late = await upgradeHeldPastRevoke(store, sessionId);
      expect(late.status).toBe(401);
      expect(late.webSocket).toBeNull();
    }
  });

  it("forgets an ended session once it would have expired anyway", async () => {
    const token = await loginAsDev("1001");
    const store = await userStore(token);
    await store.endLiveSessions("short-lived", Date.now() + 200);
    expect((await upgradeHeldPastRevoke(store, "short-lived")).status).toBe(401);
    await wait(300);
    // The next revoke prunes what has expired; the expired one's id is no longer kept.
    await store.endLiveSessions("another", Date.now() + 86_400_000);
    const kept = await runInDurableObject(store, async (_instance, state) =>
      (await state.storage.list({ prefix: "ended-session:" })).keys().toArray(),
    );
    // Other tests of this file revoke sessions of the same person: only these two are asserted.
    expect(kept).toContain("ended-session:another");
    expect(kept).not.toContain("ended-session:short-lived");
  });

  it("refuses a socket no session was named for", async () => {
    const token = await loginAsDev("1001");
    const response = await (await userStore(token)).fetch(
      new Request("https://pace-api.test/api/sync/live?device=phone-1", {
        headers: { "Sec-WebSocket-Protocol": "pace.v2", Upgrade: "websocket" },
      }),
    );
    expect(response.status).toBe(401);
    expect(response.webSocket).toBeNull();
  });
});

import {
  err,
  type Event,
  type KnownLiveServerMessage,
  LIVE_PAGE,
  LIVE_V2,
  type LiveClientMessage,
  ok,
  parseLiveClientMessage,
  type Result,
  STORE_CHANGED,
} from "@pace/core";

import type { SocketLike } from "./live.ts";

import { type FakeRoute, problem } from "./fake-fetch.fake.ts";
import { type FakeSocket, fakeSockets, say as send } from "./fake-socket.fake.ts";

/** Which way a request reached the fake server. */
export type FakeRequest = {
  readonly transport: "http" | "socket";
  readonly type: "pull" | "push";
};

type PushResult = Result<
  { readonly accepted: string[]; readonly rejected: []; readonly seq: number },
  typeof STORE_CHANGED
>;

/**
One user's store as the API keeps it, reachable both ways a client syncs: the HTTP routes
(`routes`, for the fake fetch) and the live socket (`createSocket`). Both run the same push
(one copy of a known id, another store refused whole) and the same page, as the real store
does; every socket message goes through its schema on the way in and out (class 12).
*/
export type FakeSyncServer = {
  readonly routes: Readonly<Record<string, FakeRoute>>;
  readonly createSocket: (url: string, protocols: readonly string[]) => SocketLike;
  readonly sockets: readonly FakeSocket[];
  readonly requests: FakeRequest[];
  /** The server's log, in sequence order. */
  readonly log: () => readonly Event[];
  /** The latest socket opens; a server speaking v2 (and offered it) says `hello` first. */
  readonly connect: () => FakeSocket;
  /** Another writer appends: every live socket but the writing device's hears about it. */
  readonly append: (events: readonly Event[]) => void;
  /** Sends one message to a socket, checked against the server's schema. */
  readonly send: (socket: FakeSocket, message: KnownLiveServerMessage) => void;
  /** The store is wiped: a new id and, optionally, a fresh log. */
  readonly wipe: (storeId: string, events?: readonly Event[]) => void;
  readonly options: {
    /** `pace.v1` only: no hello, no socket requests answered (an older server). */
    speaksV2: boolean;
    /** Socket requests of these types are run but never answered (the answer is lost). */
    silent: ReadonlySet<FakeRequest["type"]>;
    /** Socket requests are held, unanswered, until `release` is called. */
    isHolding: boolean;
    /** Runs before a push is applied: a test can wipe the store here. */
    beforePush?: () => void;
    /** The system events the store derives from a push (deterministic ids). */
    derive?: (pushed: readonly Event[]) => readonly Event[];
  };
  /** Answers every held socket request. */
  readonly release: () => void;
};

const deviceOf = (socket: FakeSocket): null | string =>
  new URL(socket.url).searchParams.get("device");

export const createFakeSyncServer = (initialStoreId: string): FakeSyncServer => {
  const sockets = fakeSockets();
  const requests: FakeRequest[] = [];
  const held: (() => void)[] = [];
  let storeId = initialStoreId;
  let log: Event[] = [];

  const isV2 = (socket: FakeSocket): boolean =>
    server.options.speaksV2 && socket.protocols.includes(LIVE_V2);

  /** Inserts what is new and tells the live sockets, as the store's one write path does. */
  const insert = (events: readonly Event[]): void => {
    const known = new Set(log.map((event) => event.id));
    const inserted = events.filter((event) => !known.has(event.id));
    if (inserted.length === 0) {
      return;
    }
    const since = log.length;
    log = [...log, ...inserted];
    for (const socket of sockets.made) {
      const device = deviceOf(socket);
      if (socket.closed || inserted.every((event) => event.deviceId === device)) {
        continue;
      }
      send(
        socket,
        isV2(socket)
          ? { events: inserted, more: false, seq: log.length, since, storeId, type: "events" }
          : { seq: log.length, type: "changed" },
      );
    }
  };

  const push = (events: readonly Event[], target: string): PushResult => {
    server.options.beforePush?.();
    if (target !== storeId) {
      return err(STORE_CHANGED);
    }
    insert(events);
    insert(server.options.derive?.(events) ?? []);
    return ok({ accepted: events.map((event) => event.id), rejected: [], seq: log.length });
  };

  const page = (since: number, limit: number) => ({
    events: log.slice(since, since + limit),
    more: since + limit < log.length,
    seq: Math.min(log.length, since + limit),
    storeId,
  });

  const answer = (message: LiveClientMessage): KnownLiveServerMessage => {
    switch (message.type) {
      case "push": {
        const result = push(message.events as readonly Event[], message.storeId);
        return result.ok
          ? { ...result.value, id: message.id, type: "pushed" }
          : { code: result.error, id: message.id, type: "error" };
      }
      case "pull": {
        return {
          ...page(message.since, message.limit ?? LIVE_PAGE),
          id: message.id,
          since: message.since,
          type: "events",
        };
      }
    }
  };

  const serve = (socket: FakeSocket, data: string): void => {
    if (data === "ping" || !isV2(socket)) {
      return;
    }
    const parsed = parseLiveClientMessage(data);
    if (!parsed.ok) {
      throw new Error(`The client sent an off-contract socket message: ${data}`);
    }
    const message = parsed.value;
    requests.push({ transport: "socket", type: message.type });
    const run = (): void => {
      const reply = answer(message);
      if (!server.options.silent.has(message.type)) {
        send(socket, reply);
      }
    };
    if (server.options.isHolding) {
      held.push(run);
    } else {
      // A server answers later, never inside the client's own `send`.
      queueMicrotask(run);
    }
  };

  const server: FakeSyncServer = {
    append: insert,
    connect: () => {
      const socket = sockets.made.at(-1);
      if (socket === undefined) {
        throw new Error("The client opened no socket");
      }
      socket.onSend = (data) => {
        serve(socket, data);
      };
      socket.open();
      if (isV2(socket)) {
        send(socket, { protocol: LIVE_V2, type: "hello" });
      }
      return socket;
    },
    createSocket: sockets.create,
    log: () => log,
    options: { isHolding: false, silent: new Set(), speaksV2: true },
    release: () => {
      for (const run of held.splice(0)) {
        run();
      }
    },
    requests,
    routes: {
      "GET /api/sync/pull": ({ url }) => {
        requests.push({ transport: "http", type: "pull" });
        const since = Number(url.searchParams.get("since") ?? "0");
        return page(since, Number(url.searchParams.get("limit") ?? String(LIVE_PAGE)));
      },
      "POST /api/sync/push": ({ body }) => {
        requests.push({ transport: "http", type: "push" });
        const sent = body as { readonly events: readonly Event[]; readonly storeId: string };
        const result = push(sent.events, sent.storeId);
        return result.ok ? result.value : problem(409, result.error);
      },
    },
    send,
    sockets: sockets.made,
    wipe: (next, events = []) => {
      storeId = next;
      log = [...events];
    },
  };
  return server;
};

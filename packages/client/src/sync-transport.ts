import { type EndpointOutput, endpoints, type Event, newId, STORE_CHANGED } from "@pace/core";

import type { LiveChannel } from "./live.ts";

import { type ApiClient, ApiError, ApiUnreachable } from "./api-client.ts";
import { LiveUnavailable } from "./live-requests.ts";

/*
The two ways a sync run reaches the store: HTTP (`/api/sync/push`, `/api/sync/pull`) and the
live socket's `pace.v2`. Both answer in the same shapes, so the sync client runs one code path
and never knows which one carried a call; `preferSocket` decides that, per call.
*/

/** A page of the store's log after `since`, up to `seq`; `more` says there is more past it. */
export type PullPage = {
  since: number;
  seq: number;
  storeId: string;
  events: readonly unknown[];
  more: boolean;
};

export type PushAnswer = EndpointOutput<typeof endpoints.sync.push>;

export type SyncTransport = {
  /** One batch into the store `storeId`; the server's "that store is gone" comes back as a value. */
  readonly push: (
    events: readonly Event[],
    storeId: string,
  ) => Promise<PushAnswer | typeof STORE_CHANGED>;
  readonly pull: (since: number, limit: number) => Promise<PullPage>;
};

const isStoreChanged = (error: unknown): boolean =>
  error instanceof ApiError && error.code === STORE_CHANGED;

/**
How long one HTTP sync call may go unanswered. Without it a stalled connection (a proxy holding
the request, a phone network that drops it silently, Android's no-read-timeout default) held
the run, `syncing` and the first-sync cover for good (QA round 17 review I2). A page of 200
events comes back in well under a second; the socket has its own `LIVE_REQUEST_TIMEOUT_MS`, and
only sync calls carry this (the assistant's parse may think longer).
*/
export const HTTP_SYNC_TIMEOUT_MS = 30_000;

/** An HTTP sync call that got no answer in time: the server could not be reached. */
export class SyncTimeout extends Error {
  constructor() {
    super("sync request timed out");
    this.name = "SyncTimeout";
  }
}

const withinTimeout = async <T>(call: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, HTTP_SYNC_TIMEOUT_MS);
  try {
    return await call(controller.signal);
  } catch (error) {
    throw controller.signal.aborted ? new SyncTimeout() : error;
  } finally {
    clearTimeout(timer);
  }
};

/**
The run could not reach the server: no answer at all, or none in time. Only this reads as
offline; a refusal, a page that breaks the contract or a full device store is an error the
offline line must not explain away (QA round 17 review m3).
*/
export const isUnreachable = (error: unknown): boolean =>
  error instanceof ApiUnreachable ||
  error instanceof SyncTimeout ||
  error instanceof LiveUnavailable;

/** The HTTP routes: a `409 store/changed` is read as the value, any other failure thrown. */
export const httpTransport = (api: ApiClient): SyncTransport => ({
  pull: async (since, limit) => {
    const page = await withinTimeout(
      async (signal) =>
        await api.call(
          endpoints.sync.pull,
          { query: { limit: String(limit), since: String(since) } },
          { signal },
        ),
    );
    return { ...page, since };
  },
  push: async (events, storeId) => {
    try {
      return await withinTimeout(
        async (signal) =>
          await api.call(
            endpoints.sync.push,
            { body: { events: [...events], storeId } },
            { signal },
          ),
      );
    } catch (error) {
      if (isStoreChanged(error)) {
        return STORE_CHANGED;
      }
      throw error;
    }
  },
});

/**
The live socket: a push answered `pushed` (or `error` `store/changed`), a pull answered with its
`events` page. A socket that is closed, busy or silent rejects with `LiveUnavailable`, and so
does any other answer (a `bad-request` the HTTP route will answer properly).
*/
export const socketTransport = (live: LiveChannel): SyncTransport => ({
  pull: async (since, limit) => {
    const answer = await live.request({ id: newId(), limit, since, type: "pull" });
    if (answer.type !== "events") {
      throw new LiveUnavailable("refused");
    }
    const { events, more, seq, storeId } = answer;
    return { events, more, seq, since: answer.since, storeId };
  },
  push: async (events, storeId) => {
    const answer = await live.request({ events: [...events], id: newId(), storeId, type: "push" });
    if (answer.type === "pushed") {
      const { accepted, rejected, seq } = answer;
      return { accepted, rejected, seq };
    }
    if (answer.type === "error" && answer.code === STORE_CHANGED) {
      return STORE_CHANGED;
    }
    throw new LiveUnavailable("refused");
  },
});

/** Calls `socket` first and `http` when the socket is unavailable; other failures are thrown. */
const preferring =
  <A extends readonly unknown[], R>(
    socket: (...args: A) => Promise<R>,
    http: (...args: A) => Promise<R>,
  ) =>
  async (...args: A): Promise<R> => {
    try {
      return await socket(...args);
    } catch (error) {
      if (error instanceof LiveUnavailable) {
        return await http(...args);
      }
      throw error;
    }
  };

/**
The socket while it can carry a call, HTTP when it cannot: decided per call, so a push whose
answer the socket lost goes over HTTP again (the server keeps one copy of a known id).
*/
export const preferSocket = (socket: SyncTransport, http: SyncTransport): SyncTransport => ({
  pull: preferring(socket.pull, http.pull),
  push: preferring(socket.push, http.push),
});

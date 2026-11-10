import { createStore, type StoreApi } from "zustand/vanilla";

import { endpoints } from "@pace/core";

import type { Session } from "./auth-session.ts";

import { type ApiClient, ApiError } from "./api-client.ts";
import { type EndedSessionStore, tryStore } from "./session.ts";

export type EndedSessionsState = {
  /** A session this device signed out of still waits for the server to end it. */
  readonly pending: boolean;
};

export type EndedSessions = {
  readonly store: StoreApi<EndedSessionsState>;
  /** Resolves once the kept sessions are loaded (and their retry has started). */
  readonly ready: Promise<void>;
  /** Keeps `token` to end (before the device forgets it: nothing is lost in between). */
  readonly keep: (token: string) => Promise<void>;
  /** Asks the server to end `token` now (or joins that request under way). */
  readonly send: (token: string) => Promise<void>;
  /** Asks the server again to end every session still waiting; one request per session at a time. */
  readonly retry: () => Promise<void>;
  /** The server answered something else (a login): a session still waiting goes now. */
  readonly reached: () => void;
};

/**
The one answer besides success that settles an ended session: the server's own 401
`auth/unauthorized` (it no longer knows the session, the answer to a repeated log-out). Anything
else (a timeout, a rate limit, a server error, no network, and a 4xx a proxy or a captive portal
gives) keeps it for the next try: dropping it on those left the session alive on the server
(security review M1).
*/
const isSettled = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 401 && error.code === "auth/unauthorized";

/** Asks the server to end `token`: whether it is settled (ended, or unknown to the server). */
const isEnded = async (api: ApiClient, token: string): Promise<boolean> => {
  try {
    await api.call(endpoints.auth.logout, {}, { credential: token });
    return true;
  } catch (error) {
    return isSettled(error);
  }
};

/** `send` once per token at a time: a second call while one is on its way joins it. */
const onePerToken = (
  send: (token: string) => Promise<void>,
): ((token: string) => Promise<void>) => {
  const sending = new Map<string, Promise<void>>();
  return async (token) => {
    const under = sending.get(token);
    if (under !== undefined) {
      await under;
      return;
    }
    const sent = (async (): Promise<void> => {
      try {
        await send(token);
      } finally {
        sending.delete(token);
      }
    })();
    sending.set(token, sent);
    await sent;
  };
};

/**
The sessions this device signed out of while the server could not hear it (QA round 22 R22-02,
the server half): each is kept in `kept` (between starts) and in memory (a store that fails), sent
only to the log-out, and dropped once the server settles it. Tried at once, at the next start, and
whenever the caller says the network may be back.
*/
export const createEndedSessions = (api: ApiClient, kept: EndedSessionStore): EndedSessions => {
  const store = createStore<EndedSessionsState>(() => ({ pending: false }));
  const waiting = new Set<string>();
  const publish = (): void => {
    store.setState({ pending: waiting.size > 0 });
  };
  const sendOnce = onePerToken(async (token) => {
    if (!(await isEnded(api, token))) {
      return;
    }

    waiting.delete(token);
    publish();
    await tryStore(async () => {
      await kept.remove(token);
    }, undefined);
  });
  const retry = async (): Promise<void> => {
    await Promise.all(
      [...waiting].map(async (token) => {
        await sendOnce(token);
      }),
    );
  };
  const ready = (async (): Promise<void> => {
    const stored = await tryStore(async () => await kept.list(), []);
    for (const token of stored) {
      waiting.add(token);
    }
    publish();
    void retry();
  })();
  return {
    keep: async (token) => {
      waiting.add(token);
      publish();
      await tryStore(async () => {
        await kept.add(token);
      }, undefined);
    },
    reached: () => {
      if (waiting.size > 0) {
        void retry();
      }
    },
    ready,
    retry,
    send: sendOnce,
    store,
  };
};

/**
The log-out (`Auth.logout`): the ended session is kept, the device forgets it, then the server is
told; a log-out it does not hear stays kept for the next try.
*/
export const endingLogout =
  (session: Session, ended: EndedSessions): (() => Promise<void>) =>
  async () => {
    const leaving = session.token();
    if (leaving === undefined) {
      await session.signOut();
      return;
    }
    // The note goes before anything else: another tab's 401 can come before the answer.
    await session.leaveNote(leaving);
    // Kept to end before it is forgotten: a log-out the server does not hear now is sent again
    // (at the next start, back online, after a login) until it does (R22-02).
    await ended.keep(leaving);
    // Forgotten here first, then the server is told with the token it had: once the server
    // ends the session it closes this device's socket (4401) and answers anything else 401,
    // and a check or a sync set off by that would read the person's own sign-out as "ended
    // elsewhere" (QA round 22 R22-02). Signed out, the device sends nothing more with it.
    await session.signOut();
    await ended.send(leaving);
  };

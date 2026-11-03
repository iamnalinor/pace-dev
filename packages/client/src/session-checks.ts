import { endpoints, type EndpointShape, err, type Result, type User } from "@pace/core";

import type { ApiClient } from "./api-client.ts";
import type { Auth } from "./auth.ts";

import { NoAnswerInTime, withinDeadline } from "./deadline.ts";

/**
The checks of the session in use. Any call's 401 for it asks `me` once whether it ended (`me` signs
out on its own 401). The live socket's close says so too, but a tab whose socket was not open when
the session ended (hidden, still starting) is refused at the door on every reconnect and would stay
signed in on a dead session (fix round 5 V1). `me`'s and the log-out's own 401s are their callers'
to read. While a check is under way (`pending`), a call that would send the session waits for it:
a tab still starting went on to read the bell with the ended session meanwhile (CI run 41668309388).
*/
export type SessionChecks = {
  /**
  Asks `me` now, or joins the check under way. A check that holds (the default: a 401 or the
  socket's close set it off) makes the senders wait for it; the start's own `me` does not hold, so
  a start sends its first sync and opens its socket at once, but a 401 heard while it is on its way
  joins it and holds from then on (CI fix review m3).
  */
  readonly check: (options?: { readonly holds: boolean }) => Promise<Result<User, string>>;
  readonly heard: (credential: string, endpoint: EndpointShape) => void;
  /** The check that holds, which a call (but `me` and the log-out) or a socket waits for. */
  readonly pending: (endpoint?: EndpointShape) => Promise<unknown> | undefined;
};

/** A check that got no answer in time, or that failed itself: nothing was signed out. */
const NO_ANSWER = "session-check/no-answer";
const CHECK_FAILED = "session-check/failed";

const isCheckOrEnd = (endpoint: EndpointShape): boolean =>
  endpoint === endpoints.me || endpoint === endpoints.auth.logout;

export const sessionChecks = (auth: Auth, api: ApiClient): SessionChecks => {
  const state: { checking: Promise<Result<User, string>> | undefined; holds: boolean } = {
    checking: undefined,
    holds: false,
  };
  const check = async (options?: { readonly holds: boolean }): Promise<Result<User, string>> => {
    state.holds ||= options?.holds ?? true;
    state.checking ??= (async () => {
      try {
        // Bounded like a screen's read: a `me` that gets no answer signs nothing out, and what it
        // held goes on with the session in use (CI fix review I1).
        return await withinDeadline(async (signal) => await auth.me(signal));
      } catch (error) {
        return err(error instanceof NoAnswerInTime ? NO_ANSWER : CHECK_FAILED);
      } finally {
        state.checking = undefined;
        state.holds = false;
      }
    })();
    return await state.checking;
  };
  return {
    check,
    heard: (credential, endpoint) => {
      if (isCheckOrEnd(endpoint) || !api.isCurrentSession(credential)) {
        return;
      }
      // One check: a 401 while one is on its way joins it (and makes it hold).
      void check();
    },
    pending: (endpoint): Promise<unknown> | undefined =>
      !state.holds || (endpoint !== undefined && isCheckOrEnd(endpoint))
        ? undefined
        : state.checking,
  };
};

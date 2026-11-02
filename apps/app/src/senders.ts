import type { PaceRuntime } from "./runtime.ts";

/**
How often the client pulls on its own. While the live channel is up the server says when
something changed, so the poll is only a safety net; while it is down it polls as before.
*/
export const POLL_OFFLINE_MS = 30_000;
export const POLL_LIVE_MS = 5 * 60_000;

/**
Whether what sends to the server (the sync loop, the live socket, a retry) may start: signed in,
and not while this device is ending its own session, where a request the server answers once the
session is gone would 401 and read as "ended elsewhere" (bug-lessons class 75). Every starter asks
this one helper (round 7 review 8).
*/
export const canStartSenders = ({ auth }: Pick<PaceRuntime, "auth">): boolean =>
  auth.store.getState().status === "signed-in" && !auth.isEnding();

/**
The sync loop and the socket, as a signed-in start leaves them (each start is a no-op while
running); nothing while `canStartSenders` says no.
*/
export const startSenders = (runtime: Pick<PaceRuntime, "auth" | "live" | "sync">): void => {
  if (!canStartSenders(runtime)) {
    return;
  }
  runtime.sync.start({ intervalMs: POLL_OFFLINE_MS });
  runtime.live.start();
};

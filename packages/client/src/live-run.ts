import { LIVE_SESSION_ENDED } from "@pace/core";

/** What a run tells the app about its sockets' closes (see `LiveChannelOptions`). */
type RunListeners = {
  readonly onDropped?: (() => void) | undefined;
  readonly onFailedToOpen?: (() => void) | undefined;
  readonly onSessionEnded?: (() => void) | undefined;
};

/** The run of a live channel (see `createRun`). */
export type Run = {
  readonly failures: () => number;
  readonly isRunning: () => boolean;
  readonly start: () => boolean;
  readonly stop: () => void;
  readonly opened: () => void;
  readonly lived: () => void;
  readonly wentQuiet: (streak: number) => void;
  readonly shouldReconnectAfter: (code: unknown) => boolean;
};

/**
Whether the channel should be connected, how many reconnects in a row have failed (a socket that
did not live `STABLE_MS` counts as one), whether the socket in use has opened and lived that long,
and whether a socket that never opened was said since the last one that did.
*/
export const createRun = (listeners: RunListeners): Run => {
  let failures = 0;
  let hasLived = false;
  let hasOpened = false;
  let isRunning = false;
  let isSaidNotOpened = false;
  /** A close while running that is no session end: a failure, said when it is news. */
  const failed = (wasLived: boolean, wasOpened: boolean): void => {
    failures += 1;
    if (wasLived) {
      listeners.onDropped?.();
    }
    if (wasOpened || isSaidNotOpened) {
      return;
    }

    isSaidNotOpened = true;
    listeners.onFailedToOpen?.();
  };
  return {
    failures: (): number => failures,
    isRunning: (): boolean => isRunning,
    /** Starts the run; false when it was running already. */
    start: (): boolean => {
      const wasRunning = isRunning;
      isRunning = true;
      return !wasRunning;
    },
    stop: (): void => {
      isRunning = false;
    },
    /** The socket in use opened: a streak of sockets that never did ends with it. */
    opened: (): void => {
      hasOpened = true;
      isSaidNotOpened = false;
    },
    /** The socket in use stayed up `STABLE_MS`: its backoff resets, and its drop will be said. */
    lived: (): void => {
      failures = 0;
      hasLived = true;
    },
    /** Each fresh socket that goes quiet again waits longer (`createTimers`). */
    wentQuiet: (streak: number): void => {
      failures = streak - 1;
    },
    /**
    The socket in use closed: a session end stops the run and is said; any other close while
    running counts as a failure, says a drop of a socket that had lived or the first of a streak
    that never opened, and asks for a reconnect (true).
    */
    shouldReconnectAfter: (code: unknown): boolean => {
      const wasLived = hasLived;
      const wasOpened = hasOpened;
      hasLived = false;
      hasOpened = false;
      if (!isRunning) {
        return false;
      }
      if (code === LIVE_SESSION_ENDED) {
        isRunning = false;
        listeners.onSessionEnded?.();
        return false;
      }
      failed(wasLived, wasOpened);
      return true;
    },
  };
};

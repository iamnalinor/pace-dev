import { createStore, type StoreApi } from "zustand/vanilla";

import { err, type Result } from "@pace/core";

import type { PullPage } from "./sync-transport.ts";

import {
  runSync,
  shouldPullFor,
  type SyncDeps,
  type SyncStatus,
  type SyncSummary,
} from "./sync-run.ts";
import {
  createHolds,
  createSerial,
  createTimer,
  expiringRelease,
  type RunTimer,
  settledWithin,
} from "./sync-timing.ts";

export type { SyncStatus, SyncSummary } from "./sync-run.ts";

export type SyncClient = {
  readonly status: StoreApi<SyncStatus>;
  /**
  Pull since the cursor (confirming the server store's id), push the outbox, then pull what
  the push made. Runs never overlap: a call made while one is under way gets the run after it
  (shared by every call made meanwhile), so what was written before the call goes out.
  */
  readonly syncNow: () => Promise<Result<SyncSummary, string>>;
  /** Runs now, then every `intervalMs`; failures retry with exponential backoff (1s..60s). */
  readonly start: (options: { readonly intervalMs: number }) => void;
  /** Ends the loop; a call still waiting for the run after the one in flight gets `stopped`. */
  readonly stop: () => void;
  /** A local change or a server's "changed": a run within a second, a burst making one. */
  readonly soon: () => void;
  /** The pause between runs from the next one on (rare while the live channel is up). */
  readonly setInterval: (intervalMs: number) => void;
  /**
  New events the server sent unasked: applied as a pull's page when they continue the cursor
  of the same store; anything else (a gap, `more`, another store) asks for a run instead. A
  page the log already holds (one that waited for a run to finish) changes nothing.
  */
  readonly ingestLive: (page: PullPage) => Promise<void>;
  /**
  Lets the run in flight finish (waited for at most `HOLD_WAIT_MS`), then starts none (every call
  gets `stopped`, the loop waits without ticking) until the returned `release`, or `HOLD_MAX_MS`
  at the latest: nothing goes out while this device ends its own session (a request sent once
  the server ended it would answer 401; round 6). The loop runs at once on release.
  */
  readonly hold: () => Promise<() => void>;
};

/** What a call waiting for the run after the one in flight gets when the sync stopped meanwhile. */
export const SYNC_STOPPED = "stopped";

/** How long a burst of changes may gather before it is sent. */
export const SOON_MS = 800;

/**
How long a hold waits for the run in flight: a run whose request hangs (each has its own timeout,
but a transport may not keep it) does not keep the device's own sign-out waiting for good.
*/
export const HOLD_WAIT_MS = 5000;

/**
How long a hold lasts at most: one its holder never releases (a request that hung past every
deadline, a screen gone) lets go on its own, so sync cannot stay held for good (round 7 review 2).
*/
export const HOLD_MAX_MS = 60_000;

const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 60_000;

const backoffMs = (failures: number): number =>
  Math.min(BACKOFF_MIN_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);

/** How the last runs went: failures in a row (for the backoff) and when the last one succeeded. */
const createRecord = (now: () => string) => {
  let failures = 0;
  let lastOkAt: null | string = null;
  return {
    failures: (): number => failures,
    /** Whether the last run succeeded less than `withinMs` before `at`. */
    isOkWithin: (at: string, withinMs: number): boolean =>
      lastOkAt !== null && Date.parse(at) - Date.parse(lastOkAt) < withinMs,
    note: (isOk: boolean): void => {
      failures = isOk ? 0 : failures + 1;
      lastOkAt = isOk ? now() : null;
    },
  };
};

/**
Where the loop's first tick goes once it starts: right after a run that synced everything (the
signed-in start's own) it waits its interval, since a second pull of the same nothing went out a
second later (QA round 20 L9); anything written since, or a run that failed, goes at once.
*/
const firstTickIn = async (
  deps: SyncDeps,
  isFresh: (at: string, withinMs: number) => boolean,
  intervalMs: number,
): Promise<number> => {
  if (!isFresh(deps.now(), intervalMs)) {
    return 0;
  }
  const pending = await deps.store.listPending();
  return pending.length === 0 ? intervalMs : 0;
};

/**
Settles once no run is in flight (`current` reads the one under way, if any: wrapped, since a
getter of a promise or nothing must not become one that always answers a promise).
*/
const drain = async (
  current: () => { readonly run: Promise<unknown> | undefined },
): Promise<void> => {
  for (let { run } = current(); run !== undefined; { run } = current()) {
    await run;
  }
};

/**
Runs at most one sync at a time; a second caller shares the run in flight. A live page waits for
the run in flight, so the two never move the cursor at once.
*/
const createRunner = (deps: SyncDeps, status: StoreApi<SyncStatus>) => {
  const serial = createSerial();
  let inFlight: Promise<Result<SyncSummary, string>> | undefined;
  /** The one run that follows the run in flight, shared by every call made meanwhile. */
  let next: Promise<Result<SyncSummary, string>> | undefined;
  const record = createRecord(deps.now);
  /** While any hold is in place (`hold`), no run starts. */
  const holds = createHolds();
  const run = async (): Promise<Result<SyncSummary, string>> => {
    // Syncing from the call on, even while a live page is still being applied.
    status.setState({ syncing: true });
    inFlight = serial(async () => await runSync(deps, status));
    try {
      const result = await inFlight;
      record.note(result.ok);
      return result;
    } finally {
      inFlight = undefined;
    }
  };
  /** Bumped by `stop`: a run waiting to follow one made before it is dropped. */
  let epoch = 0;
  /**
  After the run in flight has settled (each settles to a result: `runSync` catches), unless the
  sync was stopped meanwhile (signed out: it would go out with no token, fix round 5 V3).
  */
  const after = async (
    current: Promise<unknown>,
    queuedIn: number,
  ): Promise<Result<SyncSummary, string>> => {
    await current;
    if (queuedIn !== epoch || holds.isHeld()) {
      return err(SYNC_STOPPED);
    }
    next = undefined;
    return await run();
  };
  /** The runs waiting to follow the one in flight are dropped; later calls run as ever. */
  const dropWaiting = (): void => {
    epoch += 1;
    next = undefined;
  };
  return {
    dropWaiting,
    failures: record.failures,
    /** Whether the last run succeeded within `withinMs` of `at` and none is under way. */
    isFresh: (at: string, withinMs: number): boolean =>
      inFlight === undefined && record.isOkWithin(at, withinMs),
    /** Holds: runs waiting drop, the one in flight is waited for, `HOLD_WAIT_MS` at most. */
    hold: async (): Promise<() => void> => {
      const release = holds.add();
      dropWaiting();
      const drained = drain(() => ({ run: inFlight }));
      await settledWithin(drained, HOLD_WAIT_MS);
      return release;
    },
    isHeld: holds.isHeld,
    /** Applies a live page that fits; true when a pull is needed instead. */
    ingestLive: async (page: PullPage): Promise<boolean> =>
      await serial(async () => await shouldPullFor(deps, page)),
    /**
    A run that reads the outbox and the server after the call. The run in flight may have read
    them already, so a call made meanwhile is not joined to it: it gets the run that follows,
    one for every call made meanwhile (E1: a task written while a push hung on a socket gone
    quiet joined that run and waited for the next interval).
    */
    syncNow: async (): Promise<Result<SyncSummary, string>> => {
      if (holds.isHeld()) {
        return err(SYNC_STOPPED);
      }
      if (inFlight === undefined) {
        return await run();
      }
      next ??= after(inFlight, epoch);
      return await next;
    },
  };
};

/** Before any run: never synced, nothing wrong, taken to be online. */
const NOT_SYNCED: SyncStatus = { lastError: null, lastSyncAt: null, online: true, syncing: false };

type Runner = ReturnType<typeof createRunner>;

/**
The loop's next tick, after a run: its interval, or the backoff after a failure. A tick that comes
while a hold is in place parks the loop instead (`park`), which waits for the release rather
than ticking every half second (round 7 review 8).
*/
const tickOf =
  (
    runner: Runner,
    loop: {
      readonly interval: () => number | undefined;
      readonly park: () => void;
      readonly timer: () => RunTimer;
    },
  ) =>
  (): void => {
    if (runner.isHeld()) {
      loop.park();
      return;
    }
    void (async () => {
      const result = await runner.syncNow();
      const intervalMs = loop.interval();
      if (intervalMs === undefined) {
        return;
      }
      if (!result.ok && runner.isHeld()) {
        loop.park();
        return;
      }
      loop.timer().in(result.ok ? intervalMs : backoffMs(runner.failures()));
    })();
  };

/** The loop: its interval while started, its one pending tick, and whether a hold parked it. */
const createLoop = (deps: SyncDeps, runner: Runner) => {
  let intervalMs: number | undefined;
  let isParked = false;
  const timer: RunTimer = createTimer(
    tickOf(runner, {
      interval: () => intervalMs,
      park: () => {
        isParked = true;
      },
      timer: () => timer,
    }),
  );
  return {
    /** A run already due sooner stays: a burst of changes goes at most this long after the first. */
    soon: (): void => {
      if (intervalMs !== undefined && !timer.isDueWithin(SOON_MS)) {
        timer.in(SOON_MS);
      }
    },
    setInterval: (next: number): void => {
      if (intervalMs === undefined || next === intervalMs) {
        return;
      }

      intervalMs = next;
      timer.in(next);
    },
    start: (interval: number): void => {
      if (intervalMs !== undefined) {
        return;
      }

      intervalMs = interval;
      void (async () => {
        const ms = await firstTickIn(deps, runner.isFresh, interval);
        // Stopped (or started anew) meanwhile: that start schedules its own. A run asked for
        // meanwhile (`soon`) and due sooner stays (round 7 review 6).
        if (intervalMs === interval && !timer.isDueWithin(ms)) {
          timer.in(ms);
        }
      })();
    },
    stop: (): void => {
      intervalMs = undefined;
      isParked = false;
      timer.cancel();
    },
    /** Released: a loop a hold parked runs at once. */
    unpark: (): void => {
      if (!isParked || runner.isHeld()) {
        return;
      }
      isParked = false;
      if (intervalMs !== undefined) {
        timer.in(0);
      }
    },
  };
};

export const createSyncClient = (deps: SyncDeps): SyncClient => {
  const status = createStore<SyncStatus>(() => NOT_SYNCED);
  const runner = createRunner(deps, status);
  const loop = createLoop(deps, runner);
  return {
    ingestLive: async (page) => {
      try {
        if (await runner.ingestLive(page)) {
          loop.soon();
        }
      } catch {
        // The local store failed to take it: a run pulls it and reports what goes wrong.
        loop.soon();
      }
    },
    setInterval: loop.setInterval,
    soon: loop.soon,
    start: (options) => {
      loop.start(options.intervalMs);
    },
    // Released by its holder or, at the latest, `HOLD_MAX_MS` on; a loop that waited runs then.
    hold: async () => expiringRelease(await runner.hold(), HOLD_MAX_MS, loop.unpark),
    status,
    stop: () => {
      loop.stop();
      runner.dropWaiting();
    },
    syncNow: runner.syncNow,
  };
};

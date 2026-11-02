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
import { createHolds, createSerial, createTimer } from "./sync-timing.ts";

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
  Lets the run in flight finish, then starts none (every call gets `stopped`, the loop's ticks
  send nothing) until the returned `release`: nothing goes out while this device ends its own
  session (a request sent once the server ended it would answer 401; round 6).
  */
  readonly hold: () => Promise<() => void>;
};

/** What a call waiting for the run after the one in flight gets when the sync stopped meanwhile. */
export const SYNC_STOPPED = "stopped";

/** How long a burst of changes may gather before it is sent. */
export const SOON_MS = 800;

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
    /** A hold in place: the runs waiting are dropped and the one in flight finishes. */
    hold: async (): Promise<() => void> => {
      const release = holds.add();
      dropWaiting();
      while (inFlight !== undefined) {
        await inFlight;
      }
      return release;
    },
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

export const createSyncClient = (deps: SyncDeps): SyncClient => {
  const status = createStore<SyncStatus>(() => NOT_SYNCED);
  const runner = createRunner(deps, status);
  let intervalMs: number | undefined;
  const timer = createTimer(() => {
    void (async () => {
      const result = await runner.syncNow();
      if (intervalMs !== undefined) {
        timer.in(result.ok ? intervalMs : backoffMs(runner.failures()));
      }
    })();
  });
  // A run already due sooner stays: a burst of changes goes at most this long after the first.
  const soon = (): void => {
    if (intervalMs !== undefined && !timer.isDueWithin(SOON_MS)) {
      timer.in(SOON_MS);
    }
  };
  return {
    ingestLive: async (page) => {
      try {
        if (await runner.ingestLive(page)) {
          soon();
        }
      } catch {
        // The local store failed to take it: a run pulls it and reports what goes wrong.
        soon();
      }
    },
    setInterval: (next) => {
      if (intervalMs === undefined || next === intervalMs) {
        return;
      }

      intervalMs = next;
      timer.in(next);
    },
    soon,
    start: (options) => {
      if (intervalMs !== undefined) {
        return;
      }

      intervalMs = options.intervalMs;
      const interval = options.intervalMs;
      void (async () => {
        const ms = await firstTickIn(deps, runner.isFresh, interval);
        // Stopped (or started anew) meanwhile: that start schedules its own.
        if (intervalMs === interval) {
          timer.in(ms);
        }
      })();
    },
    hold: runner.hold,
    status,
    stop: () => {
      intervalMs = undefined;
      timer.cancel();
      runner.dropWaiting();
    },
    syncNow: runner.syncNow,
  };
};

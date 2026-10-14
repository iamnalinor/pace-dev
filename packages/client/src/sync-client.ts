import { createStore, type StoreApi } from "zustand/vanilla";

import {
  type EndpointOutput,
  endpoints,
  err,
  type Event,
  ok,
  parseEvent,
  type Result,
  STORE_CHANGED,
} from "@pace/core";

import type { EventStore } from "./event-store.ts";
import type { AppStateHandle } from "./state.ts";

import { type ApiClient, ApiError } from "./api-client.ts";

export type SyncStatus = {
  /** False after a transport failure (no network), true again after any response. */
  readonly online: boolean;
  readonly syncing: boolean;
  readonly lastError: null | string;
  readonly lastSyncAt: null | string;
};

export type SyncSummary = { readonly pulled: number; readonly pushed: number };

export type SyncClient = {
  readonly status: StoreApi<SyncStatus>;
  /**
  Pull since the cursor (confirming the server store's id), push the outbox, then pull what
  the push made. Concurrent calls share one run.
  */
  readonly syncNow: () => Promise<Result<SyncSummary, string>>;
  /** Runs now, then every `intervalMs`; failures retry with exponential backoff (1s..60s). */
  readonly start: (options: { readonly intervalMs: number }) => void;
  readonly stop: () => void;
  /** A local change or a server's "changed": a run within a second, a burst making one. */
  readonly soon: () => void;
  /** The pause between runs from the next one on (rare while the live channel is up). */
  readonly setInterval: (intervalMs: number) => void;
};

/** How long a burst of changes may gather before it is sent. */
const SOON_MS = 800;

const PUSH_BATCH = 200;
const PULL_LIMIT = "200";
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 60_000;

const chunk = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
Drops the local copy because the server's store changed: the log, its outbox and the cursor
go, the new id (when known) is kept, and the state is rebuilt empty. What was written while
this happened goes with it, deliberately: it was written on a copy that no longer exists.
*/
type Reset = (storeId: null | string) => Promise<void>;

/** One run's reset: a second change within the same run stops it, and the next run retries. */
const createReset = (store: EventStore, state: AppStateHandle): Reset => {
  let isUsed = false;
  return async (storeId) => {
    if (isUsed) {
      throw new ApiError(409, STORE_CHANGED, STORE_CHANGED);
    }
    isUsed = true;
    await store.clear();
    if (storeId !== null) {
      await store.setStoreId(storeId);
    }
    await state.rematerialize();
  };
};

const isStoreChanged = (error: unknown): boolean =>
  error instanceof ApiError && error.code === STORE_CHANGED;

type Pushed = {
  readonly pushed: number;
  readonly rejected: readonly string[];
  /** The server refused the outbox for a store it no longer has: the copy was dropped. */
  readonly isReset: boolean;
};

/** What one sync run works with: the transport, the local copy and its one reset. */
type Run = {
  readonly api: ApiClient;
  readonly reset: Reset;
  readonly state: AppStateHandle;
  readonly store: EventStore;
};

/** One batch into the store `storeId`; the server's "that store is gone" comes back as a value. */
const pushBatch = async (
  api: ApiClient,
  events: readonly Event[],
  storeId: string,
): Promise<EndpointOutput<typeof endpoints.sync.push> | typeof STORE_CHANGED> => {
  try {
    return await api.call(endpoints.sync.push, { body: { events: [...events], storeId } });
  } catch (error) {
    if (isStoreChanged(error)) {
      return STORE_CHANGED;
    }
    throw error;
  }
};

/** Pushes the outbox into the store the pull confirmed, and only into that one. */
const pushOutbox = async ({ api, reset, store }: Run): Promise<Pushed> => {
  let pushed = 0;
  const rejected: string[] = [];
  const storeId = await store.getStoreId();
  const batches = storeId === null ? [] : chunk(await store.listPending(), PUSH_BATCH);
  for (const batch of batches) {
    const result = await pushBatch(api, batch, storeId ?? "");
    if (result === STORE_CHANGED) {
      await reset(null);
      return { isReset: true, pushed, rejected };
    }
    await store.markSynced(result.accepted);
    pushed += result.accepted.length;
    rejected.push(...result.rejected.map((item) => `${item.id} (${item.reason})`));
  }
  return { isReset: false, pushed, rejected };
};

const validEvents = (items: readonly unknown[]): readonly Event[] =>
  items.flatMap((item) => {
    const parsed = parseEvent(item);
    return parsed.ok ? [parsed.value] : [];
  });

/**
Whether a page comes from the server store the local log belongs to. The first pull of an
empty cursor adopts the store's id. A different id (or a log pulled before ids existed)
means the server's data was reset: the local copy is dropped (see `Reset`).
*/
const isSameStore = async (
  store: EventStore,
  reset: Reset,
  page: { readonly since: number; readonly storeId: string },
): Promise<boolean> => {
  const known = await store.getStoreId();
  if (known === page.storeId) {
    return true;
  }
  if (known === null && page.since === 0) {
    await store.setStoreId(page.storeId);
    return true;
  }
  await reset(page.storeId);
  return false;
};

const pullSince = async ({ api, reset, state, store }: Run): Promise<number> => {
  let pulled = 0;
  let isMore = true;
  while (isMore) {
    const since = await store.getCursor();
    const page = await api.call(endpoints.sync.pull, {
      query: { limit: PULL_LIMIT, since: String(since) },
    });
    if (!(await isSameStore(store, reset, { since, storeId: page.storeId }))) {
      // Dropped: start again from the fresh store's first event.
      pulled = 0;
      continue;
    }
    const events = validEvents(page.events);
    await state.ingest(events);
    await store.setCursor(page.seq);
    pulled += events.length;
    isMore = page.more;
  }
  return pulled;
};

type SyncDeps = {
  readonly api: ApiClient;
  readonly now: () => string;
  readonly state: AppStateHandle;
  readonly store: EventStore;
};

const runSync = async (
  deps: SyncDeps,
  status: StoreApi<SyncStatus>,
): Promise<Result<SyncSummary, string>> => {
  const { api, now, state, store } = deps;
  status.setState({ syncing: true });
  try {
    await state.ready;
    const run: Run = { api, reset: createReset(store, state), state, store };
    // The pull goes first: it confirms the store id, so an outbox meant for a store that
    // was reset since is dropped instead of landing in the fresh one (the push names the
    // store too, for a reset between the two).
    const before = await pullSince(run);
    const { isReset, pushed, rejected } = await pushOutbox(run);
    // What the server derived from the pushed events comes back at once; after a refused
    // push the fresh store's log is pulled from the start.
    const after = isReset || pushed > 0 ? await pullSince(run) : 0;
    const pulled = (isReset ? 0 : before) + after;
    status.setState({
      lastError: rejected.length === 0 ? null : `push rejected: ${rejected.join(", ")}`,
      lastSyncAt: now(),
      online: true,
      syncing: false,
    });
    return ok({ pulled, pushed });
  } catch (error) {
    status.setState({
      lastError: describe(error),
      online: error instanceof ApiError,
      syncing: false,
    });
    return err(describe(error));
  }
};

const backoffMs = (failures: number): number =>
  Math.min(BACKOFF_MIN_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);

/** One pending run at a time: when it is due, and moving it earlier or later. */
const createTimer = (run: () => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dueAt: number | undefined;
  const cancel = (): void => {
    clearTimeout(timer);
    timer = undefined;
    dueAt = undefined;
  };
  return {
    cancel,
    /** Replaces the pending run with one in `delayMs`. */
    in: (delayMs: number): void => {
      cancel();
      dueAt = Date.now() + delayMs;
      timer = setTimeout(() => {
        timer = undefined;
        dueAt = undefined;
        run();
      }, delayMs);
    },
    /** Whether a run is already due within `delayMs`. */
    isDueWithin: (delayMs: number): boolean => dueAt !== undefined && dueAt <= Date.now() + delayMs,
  };
};

/** Runs at most one sync at a time; a second caller shares the run in flight. */
const createRunner = (deps: SyncDeps, status: StoreApi<SyncStatus>) => {
  let inFlight: Promise<Result<SyncSummary, string>> | undefined;
  let failures = 0;
  return {
    failures: (): number => failures,
    syncNow: async (): Promise<Result<SyncSummary, string>> => {
      if (inFlight !== undefined) {
        return await inFlight;
      }
      inFlight = runSync(deps, status);
      try {
        const result = await inFlight;
        failures = result.ok ? 0 : failures + 1;
        return result;
      } finally {
        inFlight = undefined;
      }
    },
  };
};

export const createSyncClient = (deps: SyncDeps): SyncClient => {
  const status = createStore<SyncStatus>(() => ({
    lastError: null,
    lastSyncAt: null,
    online: true,
    syncing: false,
  }));
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
  return {
    setInterval: (next) => {
      if (intervalMs === undefined || next === intervalMs) {
        return;
      }

      intervalMs = next;
      timer.in(next);
    },
    // A run already due sooner stays: a burst of changes goes at most this long after the first.
    soon: () => {
      if (intervalMs !== undefined && !timer.isDueWithin(SOON_MS)) {
        timer.in(SOON_MS);
      }
    },
    start: (options) => {
      if (intervalMs !== undefined) {
        return;
      }

      intervalMs = options.intervalMs;
      timer.in(0);
    },
    status,
    stop: () => {
      intervalMs = undefined;
      timer.cancel();
    },
    syncNow: runner.syncNow,
  };
};

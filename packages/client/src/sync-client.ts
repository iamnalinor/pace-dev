import { createStore, type StoreApi } from "zustand/vanilla";

import { endpoints, err, type Event, ok, parseEvent, type Result } from "@pace/core";

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
  /** Push the outbox, then pull since the cursor. Concurrent calls share one run. */
  readonly syncNow: () => Promise<Result<SyncSummary, string>>;
  /** Runs now, then every `intervalMs`; failures retry with exponential backoff (1s..60s). */
  readonly start: (options: { readonly intervalMs: number }) => void;
  readonly stop: () => void;
};

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

const pushOutbox = async (
  api: ApiClient,
  store: EventStore,
): Promise<{ readonly pushed: number; readonly rejected: readonly string[] }> => {
  let pushed = 0;
  const rejected: string[] = [];
  const batches = chunk(await store.listPending(), PUSH_BATCH);
  for (const batch of batches) {
    const result = await api.call(endpoints.sync.push, { body: { events: [...batch] } });
    await store.markSynced(result.accepted);
    pushed += result.accepted.length;
    rejected.push(...result.rejected.map((item) => `${item.id} (${item.reason})`));
  }
  return { pushed, rejected };
};

const validEvents = (items: readonly unknown[]): readonly Event[] =>
  items.flatMap((item) => {
    const parsed = parseEvent(item);
    return parsed.ok ? [parsed.value] : [];
  });

const pullSince = async (
  api: ApiClient,
  store: EventStore,
  state: AppStateHandle,
): Promise<number> => {
  let pulled = 0;
  let isMore = true;
  while (isMore) {
    const since = String(await store.getCursor());
    const page = await api.call(endpoints.sync.pull, { query: { limit: PULL_LIMIT, since } });
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
    const { pushed, rejected } = await pushOutbox(api, store);
    const pulled = await pullSince(api, store, state);
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

export const createSyncClient = (deps: SyncDeps): SyncClient => {
  const status = createStore<SyncStatus>(() => ({
    lastError: null,
    lastSyncAt: null,
    online: true,
    syncing: false,
  }));
  let inFlight: Promise<Result<SyncSummary, string>> | undefined;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let intervalMs: number | undefined;

  const syncNow = async (): Promise<Result<SyncSummary, string>> => {
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
  };

  const tick = async (): Promise<void> => {
    const result = await syncNow();
    if (intervalMs !== undefined) {
      schedule(result.ok ? intervalMs : backoffMs(failures));
    }
  };

  const schedule = (delayMs: number): void => {
    timer = setTimeout(() => {
      timer = undefined;
      void tick();
    }, delayMs);
  };

  return {
    start: (options) => {
      if (intervalMs !== undefined) {
        return;
      }

      intervalMs = options.intervalMs;
      schedule(0);
    },
    status,
    stop: () => {
      intervalMs = undefined;
      if (timer === undefined) {
        return;
      }

      clearTimeout(timer);
      timer = undefined;
    },
    syncNow,
  };
};

import type { StoreApi } from "zustand/vanilla";

import { err, type Event, ok, parseEvent, type Result, STORE_CHANGED } from "@pace/core";

import type { EventStore } from "./event-store.ts";
import type { AppStateHandle } from "./state.ts";

import { ApiError } from "./api-client.ts";
import { isUnreachable, type PullPage, type SyncTransport } from "./sync-transport.ts";
import { SYNC_SCHEMA_VERSION, upgradeCursor } from "./sync-version.ts";

/*
One sync run: pull since the cursor (confirming the server store's id), push the outbox, then
pull what the push made; and a page the server sends unasked. The loop around it is
`sync-client.ts`.
*/

export type SyncStatus = {
  /** False after a transport failure (no network), true again after any response. */
  readonly online: boolean;
  readonly syncing: boolean;
  readonly lastError: null | string;
  readonly lastSyncAt: null | string;
};

export type SyncSummary = { readonly pulled: number; readonly pushed: number };

/** A run's page belonged to a local copy that was wiped while it was on its way. */
export const COPY_CHANGED = "sync/copy-changed";

const PUSH_BATCH = 200;
const PULL_LIMIT = 200;

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
    // Through the log's write queue: a local write still waiting must not land in the fresh copy.
    await state.clear();
    // The fresh copy is pulled from 0 by this client, so it needs no re-pull of its own.
    await store.setSyncVersion(SYNC_SCHEMA_VERSION);
    if (storeId !== null) {
      await store.setStoreId(storeId);
    }
  };
};

type Pushed = {
  readonly pushed: number;
  readonly rejected: readonly string[];
  /** The server refused the outbox for a store it no longer has: the copy was dropped. */
  readonly isReset: boolean;
};

/**
What one sync run works with: the transport (whichever carries each call, see
`sync-transport.ts`), the local copy and its one reset.
*/
type Run = {
  readonly transport: SyncTransport;
  readonly reset: Reset;
  readonly state: AppStateHandle;
  readonly store: EventStore;
};

/** Pushes the outbox into the store the pull confirmed, and only into that one. */
const pushOutbox = async ({ reset, store, transport }: Run): Promise<Pushed> => {
  let pushed = 0;
  const rejected: string[] = [];
  const storeId = await store.getStoreId();
  const batches = storeId === null ? [] : chunk(await store.listPending(), PUSH_BATCH);
  for (const batch of batches) {
    const result = await transport.push(batch, storeId ?? "");
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
const isSameStore = async ({
  ensureCopy,
  page,
  reset,
  store,
}: {
  readonly store: EventStore;
  readonly reset: Reset;
  readonly page: { readonly since: number; readonly storeId: string };
  /** Throws when the local copy the page was asked for is gone. */
  readonly ensureCopy: () => void;
}): Promise<boolean> => {
  const known = await store.getStoreId();
  if (known === page.storeId) {
    return true;
  }
  ensureCopy();
  if (known === null && page.since === 0) {
    await store.setStoreId(page.storeId);
    return true;
  }
  await reset(page.storeId);
  return false;
};

/**
Applies one page of the server's log: the pull's pages and the live socket's alike. A page of
another store drops the local copy instead (`null`); otherwise its valid events go in and the
cursor moves to its `seq`. `copy` is the local copy the page was asked for (`state.copy()`).
*/
const applyPage = async (
  { reset, state, store }: Run,
  page: PullPage,
  copy: number,
): Promise<null | readonly Event[]> => {
  // Asked for a copy that was wiped since (a sign-out, another server): nothing of it is
  // written into the fresh one, neither its store id, its events nor its cursor.
  const ensureCopy = (): void => {
    if (state.copy() !== copy) {
      throw new Error(COPY_CHANGED);
    }
  };
  ensureCopy();
  if (!(await isSameStore({ ensureCopy, page, reset, store }))) {
    return null;
  }
  const events = validEvents(page.events);
  ensureCopy();
  await state.ingest(events);
  ensureCopy();
  await store.setCursor(page.seq);
  return events;
};

const pullSince = async (run: Run): Promise<number> => {
  let pulled = 0;
  let isMore = true;
  while (isMore) {
    const copy = run.state.copy();
    const page = await run.transport.pull(await run.store.getCursor(), PULL_LIMIT);
    const events = await applyPage(run, page, copy);
    if (events === null) {
      // Dropped: start again from the fresh store's first event.
      pulled = 0;
      continue;
    }
    pulled += events.length;
    isMore = page.more;
  }
  return pulled;
};

/**
How a page the server sent unasked fits the local log: `apply` when it continues the cursor of
the same store, `known` when the log already reaches past it, `pull` otherwise.
*/
const fitOf = async (store: EventStore, page: PullPage): Promise<"apply" | "known" | "pull"> => {
  const storeId = await store.getStoreId();
  const cursor = await store.getCursor();
  if (storeId !== page.storeId) {
    return "pull";
  }
  if (page.seq <= cursor) {
    return "known";
  }
  return page.since === cursor && !page.more ? "apply" : "pull";
};

export type SyncDeps = {
  readonly transport: SyncTransport;
  readonly now: () => string;
  readonly state: AppStateHandle;
  readonly store: EventStore;
};

export const runSync = async (
  deps: SyncDeps,
  status: StoreApi<SyncStatus>,
): Promise<Result<SyncSummary, string>> => {
  const { now, state, store, transport } = deps;
  try {
    await state.ready;
    await upgradeCursor(store);
    const run: Run = { reset: createReset(store, state), state, store, transport };
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
      online: !isUnreachable(error),
      syncing: false,
    });
    return err(describe(error));
  }
};

/** Applies a live page that fits (one at a time, never during a run); true when a pull is needed. */
export const shouldPullFor = async (deps: SyncDeps, page: PullPage): Promise<boolean> => {
  await deps.state.ready;
  const copy = deps.state.copy();
  const fit = await fitOf(deps.store, page);
  if (fit === "apply") {
    await applyPage({ ...deps, reset: createReset(deps.store, deps.state) }, page, copy);
  }
  return fit === "pull";
};

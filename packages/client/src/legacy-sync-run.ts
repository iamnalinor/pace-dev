import { err, type Event, parseEvent, STORE_CHANGED } from "@pace/core";

import type { CopyGuard, LocalSnapshot } from "./checkpoint-store-types.ts";
import type { EventStore } from "./event-store.ts";
import type { AppStateHandle } from "./state.ts";
import type { PullPage, SyncTransport } from "./sync-transport.ts";

import { ApiError } from "./api-client.ts";
import { isSameCopy } from "./checkpoint-store.ts";
import { COPY_CHANGED, type SyncDeps, type SyncSummary } from "./sync-types.ts";
import { SYNC_SCHEMA_VERSION, upgradeCursor } from "./sync-version.ts";

const PUSH_BATCH = 200;
const PULL_LIMIT = 200;

const chunk = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

/**
Drops the local copy because the server's store changed: the log, its outbox and the cursor
go, the new id (when known) is kept, and the state is rebuilt empty. What was written while
this happened goes with it, deliberately: it was written on a copy that no longer exists.
*/
type Reset = (storeId: string, guard: CopyGuard) => Promise<void>;

/** A confirmed server generation changes the copy in one guarded full-source transaction. */
const createReset = (store: EventStore, state: AppStateHandle): Reset => {
  let isUsed = false;
  return async (storeId, guard) => {
    if (isUsed) {
      throw new ApiError(409, STORE_CHANGED, STORE_CHANGED);
    }
    isUsed = true;
    const result = await state.commitSnapshot(
      async () => await store.applyLegacyPage({ guard, storeId, since: 0, seq: 0, events: [] }),
      true,
    );
    if (!result.ok) {
      throw new Error(result.error);
    }
    await state.rematerialize();
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
const pushBatch = async (run: Run, inventory: LocalSnapshot, batch: readonly Event[]) => {
  const current = await run.store.readSnapshot();
  if (!isSameCopy(current, inventory)) {
    throw new Error(COPY_CHANGED);
  }
  const result = await run.transport.push(batch, inventory.storeId ?? "");
  if (result !== STORE_CHANGED) {
    await run.store.markSynced(result.accepted, inventory);
  }
  return result;
};
const pushOutbox = async (run: Run): Promise<Pushed> => {
  const inventory = await run.store.readSnapshot();
  if (run.state.localCopy()?.owner !== inventory.owner) {
    throw new Error(COPY_CHANGED);
  }
  const pending = inventory.records
    .filter((record) => inventory.pendingIds.includes(record.event.id))
    .map((record) => record.event);
  const batches = inventory.storeId === null ? [] : chunk(pending, PUSH_BATCH);
  let pushed = 0;
  const rejected: string[] = [];
  for (const batch of batches) {
    const result = await pushBatch(run, inventory, batch);
    if (result === STORE_CHANGED) {
      return { isReset: true, pushed, rejected };
    }
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

/**
Applies one page of the server's log: the pull's pages and the live socket's alike. A page of
another store drops the local copy instead (`null`); otherwise its valid events go in and the
cursor moves to its `seq`. `copy` is the local copy the page was asked for (`state.copy()`).
*/
const applyPage = async (
  { reset, state, store }: Run,
  page: PullPage,
  captured: { readonly copy: number; readonly guard: LocalSnapshot },
): Promise<null | readonly Event[]> => {
  if (state.copy() !== captured.copy) {
    throw new Error(COPY_CHANGED);
  }
  const { guard } = captured;
  const isInitial = guard.storeId === null && guard.cursor === 0;
  if (!isInitial && guard.storeId !== page.storeId) {
    await reset(page.storeId, guard);
    return null;
  }
  const events = validEvents(page.events);
  const result = await state.commitSnapshot(async () =>
    state.copy() === captured.copy
      ? await store.applyLegacyPage({
          guard,
          storeId: page.storeId,
          since: page.since,
          seq: page.seq,
          events,
          syncVersion: Math.max(guard.syncVersion, SYNC_SCHEMA_VERSION),
        })
      : err(COPY_CHANGED),
  );
  if (!result.ok) {
    throw new Error(result.error);
  }
  await state.rematerialize();
  return events;
};

const nextPage = async (run: Run) => {
  const copy = run.state.copy();
  const guard = await run.store.readSnapshot();
  if (run.state.localCopy()?.owner !== guard.owner) {
    throw new Error(COPY_CHANGED);
  }
  const page = await run.transport.pull(guard.cursor, PULL_LIMIT);
  const events = await applyPage(run, page, { copy, guard });
  if (events !== null && page.more && page.seq <= guard.cursor) {
    throw new Error("history/incomplete");
  }
  return { page, events };
};
const pullSince = async (run: Run): Promise<number> => {
  let pulled = 0;
  let isMore = true;
  while (isMore) {
    const { page, events } = await nextPage(run);
    if (events === null) {
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
const fitOf = (snapshot: LocalSnapshot, page: PullPage): "apply" | "known" | "pull" => {
  if (snapshot.storeId !== page.storeId) {
    return "pull";
  }
  if (page.seq <= snapshot.cursor) {
    return "known";
  }
  return page.since === snapshot.cursor && !page.more ? "apply" : "pull";
};

export const runLegacySync = async (
  deps: SyncDeps,
): Promise<{ readonly summary: SyncSummary; readonly rejected: readonly string[] }> => {
  const { store, state, transport } = deps;
  await upgradeCursor(store, state);
  const run: Run = { reset: createReset(store, state), store, state, transport };
  const before = await pullSince(run);
  const { isReset, pushed, rejected } = await pushOutbox(run);
  const after = isReset || pushed > 0 ? await pullSince(run) : 0;
  return { summary: { pulled: (isReset ? 0 : before) + after, pushed }, rejected };
};
export const shouldPullLegacy = async (deps: SyncDeps, page: PullPage): Promise<boolean> => {
  const copy = deps.state.copy();
  const guard = await deps.store.readSnapshot();
  if (deps.state.localCopy()?.owner !== guard.owner) {
    return true;
  }
  const fit = fitOf(guard, page);
  if (fit === "apply") {
    await applyPage({ ...deps, reset: createReset(deps.store, deps.state) }, page, { copy, guard });
  }
  return fit === "pull";
};

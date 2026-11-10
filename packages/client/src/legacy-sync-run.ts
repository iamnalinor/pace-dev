import { err, type Event, parseEvent, STORE_CHANGED } from "@pace/core";

import type { CopyGuard, CopyMeta } from "./checkpoint-store-types.ts";
import type { EventStore } from "./event-store.ts";
import type { AppStateHandle } from "./state.ts";
import type { PullPage, SyncTransport } from "./sync-transport.ts";

import { ApiError } from "./api-client.ts";
import { COPY_CHANGED, HISTORY_INCOMPLETE, SyncError, valueOrThrow } from "./sync-error.ts";
import { pushOutbox } from "./sync-push.ts";
import { SYNC_PAGE, type SyncDeps, type SyncRun } from "./sync-types.ts";
import { SYNC_SCHEMA_VERSION, upgradeCursor } from "./sync-version.ts";

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
    valueOrThrow(
      await state.commitLegacyPage(
        async () => await store.applyLegacyPage({ guard, storeId, since: 0, seq: 0, events: [] }),
        true,
      ),
    );
  };
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

const validEvents = (items: readonly unknown[]): readonly Event[] =>
  items.flatMap((item) => {
    const parsed = parseEvent(item);
    return parsed.ok ? [parsed.value] : [];
  });

/**
Applies one page of the server's log: the pull's pages and the live socket's alike. A page of
another store drops the local copy instead (`null`); otherwise its valid events go in and the
cursor moves to its `seq`. The first pull of an empty cursor adopts the store's id. `copy` is the
local copy the page was asked for (`state.copy()`).
*/
const applyPage = async (
  { reset, state, store }: Run,
  page: PullPage,
  captured: { readonly copy: number; readonly guard: CopyMeta },
): Promise<null | readonly Event[]> => {
  if (state.copy() !== captured.copy) {
    throw new SyncError(COPY_CHANGED);
  }
  const { guard } = captured;
  const isInitial = guard.storeId === null && guard.cursor === 0;
  if (!isInitial && guard.storeId !== page.storeId) {
    await reset(page.storeId, guard);
    return null;
  }
  const events = validEvents(page.events);
  valueOrThrow(
    await state.commitLegacyPage(async () =>
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
    ),
  );
  return events;
};

/**
Where the next page starts: the cursor, or the log's start for a copy still built on a checkpoint.
The server stopped offering checkpoints (the flag rolled back, or a checkpoint version this build
does not read), so that copy becomes a full one: the page from the start replaces its base and
keeps its outbox (`legacyPageChange`), and the pages after it follow the cursor (PR 55 review I1).
*/
const sinceOf = (guard: CopyMeta): number => (guard.coverage === "checkpoint" ? 0 : guard.cursor);

const nextPage = async (run: Run) => {
  const copy = run.state.copy();
  const guard = await run.store.readMeta();
  if (run.state.localCopy()?.owner !== guard.owner) {
    throw new SyncError(COPY_CHANGED);
  }
  const since = sinceOf(guard);
  const page = await run.transport.pull(since, SYNC_PAGE);
  const events = await applyPage(run, page, { copy, guard });
  if (events !== null && page.more && page.seq <= since) {
    throw new SyncError(HISTORY_INCOMPLETE);
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
the same store, `known` when the log already reaches past it, `pull` otherwise (a copy still
built on a checkpoint included: its run turns it into a full one first).
*/
const fitOf = (snapshot: CopyMeta, page: PullPage): "apply" | "known" | "pull" => {
  if (snapshot.storeId !== page.storeId || snapshot.coverage === "checkpoint") {
    return "pull";
  }
  if (page.seq <= snapshot.cursor) {
    return "known";
  }
  return page.since === snapshot.cursor && !page.more ? "apply" : "pull";
};

export const runLegacySync = async (deps: SyncDeps): Promise<SyncRun> => {
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
  const guard = await deps.store.readMeta();
  if (deps.state.localCopy()?.owner !== guard.owner) {
    return true;
  }
  const fit = fitOf(guard, page);
  if (fit === "apply") {
    await applyPage({ ...deps, reset: createReset(deps.store, deps.state) }, page, { copy, guard });
  }
  return fit === "pull";
};

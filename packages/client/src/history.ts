import { err, ok, type Result } from "@pace/core";

import type { CopyGuard, LocalSnapshot } from "./checkpoint-store-types.ts";
import type { EventStore } from "./event-store.ts";
import type { HistoryCoordinator, HistoryError } from "./history-types.ts";
import type { AppStateHandle } from "./state.ts";

import { readCompleteSource } from "./history-source.ts";
import { isUnreachable, type SyncTransport } from "./sync-transport.ts";

type Options = {
  readonly state: AppStateHandle;
  readonly store: EventStore;
  readonly pull: SyncTransport["pull"];
};
type Attempt = {
  readonly copy: number;
  readonly controller: AbortController;
  readonly identity: () => CopyGuard | undefined;
  readonly bindIdentity: (identity: CopyGuard | undefined) => void;
};
const isCurrent = (state: AppStateHandle, attempt: Attempt): boolean => {
  if (attempt.controller.signal.aborted || state.copy() !== attempt.copy) {
    return false;
  }
  const identity = attempt.identity();
  if (identity === undefined) {
    return true;
  }
  const current = state.localCopy();
  return (
    current?.copyToken === identity.copyToken &&
    current.owner === identity.owner &&
    current.storeId === identity.storeId
  );
};

const createAttempt = (state: AppStateHandle): Attempt => {
  let identity = state.localCopy();
  return {
    copy: state.copy(),
    controller: new AbortController(),
    identity: () => identity,
    bindIdentity: (next) => {
      identity = next;
    },
  };
};
const capture = async (
  options: Options,
  attempt: Attempt,
): Promise<Result<(LocalSnapshot & { readonly storeId: string }) | null, HistoryError>> => {
  const { state, store } = options;
  await state.ready;
  if (!isCurrent(state, attempt) || attempt.controller.signal.aborted) {
    return err("sync/copy-changed");
  }
  attempt.bindIdentity(state.localCopy());
  if (state.store.getState().historyCoverage === "full") {
    return ok(null);
  }
  const guard = await store.readSnapshot();
  if (attempt.identity()?.owner !== guard.owner) {
    return err("sync/copy-changed");
  }
  if (guard.storeId === null) {
    return err("history/unavailable");
  }
  attempt.bindIdentity(guard);
  return ok({ ...guard, storeId: guard.storeId });
};
const hydrateCaptured = async (
  options: Options,
  input: {
    readonly attempt: Attempt;
    readonly guard: LocalSnapshot & { readonly storeId: string };
  },
): Promise<Result<void, HistoryError>> => {
  const { state, store, pull } = options;
  const { attempt, guard } = input;
  const source = await readCompleteSource({
    storeId: guard.storeId,
    through: guard.cursor,
    pull,
    signal: attempt.controller.signal,
    isCurrent: () => isCurrent(state, attempt) && !attempt.controller.signal.aborted,
  });
  if (!source.ok) {
    return source;
  }
  const installed = await state.commitSnapshot(async () =>
    isCurrent(state, attempt) && !attempt.controller.signal.aborted
      ? await store.installHistory({ guard, through: guard.cursor, sourceRecords: source.value })
      : err<HistoryError>("sync/copy-changed"),
  );
  if (!installed.ok) {
    return installed;
  }
  await state.rematerialize();
  return ok(undefined);
};
const hydrate = async (options: Options, attempt: Attempt): Promise<Result<void, HistoryError>> => {
  const captured = await capture(options, attempt);
  if (!captured.ok) {
    return captured;
  }
  if (captured.value === null) {
    return ok(undefined);
  }
  const { state } = options;
  const unsubscribe = state.store.subscribe(() => {
    if (!isCurrent(state, attempt)) {
      attempt.controller.abort();
    }
  });
  state.store.setState({ historyStatus: "loading", historyError: null });
  try {
    return await hydrateCaptured(options, { attempt, guard: captured.value });
  } finally {
    unsubscribe();
  }
};

const outcome = async (options: Options, attempt: Attempt): Promise<Result<void, HistoryError>> => {
  try {
    return await hydrate(options, attempt);
  } catch (error) {
    if (
      (error instanceof Error && error.message === "sync/copy-changed") ||
      !isCurrent(options.state, attempt) ||
      attempt.controller.signal.aborted
    ) {
      return err("sync/copy-changed");
    }
    return err(isUnreachable(error) ? "history/offline" : "history/unavailable");
  }
};

export const createHistoryCoordinator = (options: Options): HistoryCoordinator => {
  const { state } = options;
  let current:
    | undefined
    | { readonly attempt: Attempt; readonly promise: Promise<Result<void, HistoryError>> };
  let isClosed = false;
  const active = () => current;
  const ensureComplete = async (): Promise<Result<void, HistoryError>> => {
    if (isClosed) {
      return err("sync/copy-changed");
    }
    if (current !== undefined && isCurrent(state, current.attempt)) {
      return await current.promise;
    }
    current?.attempt.controller.abort();
    const attempt = createAttempt(state);
    const promise = (async () => {
      const result = await outcome(options, attempt);
      if (isCurrent(state, attempt)) {
        state.store.setState(
          result.ok
            ? { historyStatus: "ready", historyError: null }
            : { historyStatus: "failed", historyError: result.error },
        );
      }
      return result;
    })();
    current = { attempt, promise };
    try {
      return await promise;
    } finally {
      if (active()?.attempt === attempt) {
        current = undefined;
      }
    }
  };
  state.setHistoryLoader(ensureComplete);
  return {
    ensureComplete,
    close: () => {
      isClosed = true;
      current?.attempt.controller.abort();
      state.store.setState({ historyStatus: "idle", historyError: null });
    },
  };
};

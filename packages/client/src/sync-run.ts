import type { StoreApi } from "zustand/vanilla";

import { err, ok, type Result } from "@pace/core";

import type { SyncDeps, SyncRun, SyncStatus, SyncSummary } from "./sync-types.ts";

import { runLegacySync, shouldPullLegacy } from "./legacy-sync-run.ts";
import { COPY_CHANGED, isSyncError, SOURCE_UNREADABLE } from "./sync-error.ts";
import { isStoreBusy, isUnreachable, type PullPage, STORE_BUSY } from "./sync-transport.ts";

export type { SyncDeps, SyncStatus, SyncSummary } from "./sync-types.ts";
const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
/** The checkpoint run for a copy that syncs from one (`CheckpointSync.enabled`), else the legacy run. */
const chosenRun = async (deps: SyncDeps): Promise<SyncRun> => {
  await deps.state.ready;
  if (deps.checkpointSync === undefined || !(await deps.checkpointSync.enabled())) {
    return await runLegacySync(deps);
  }
  try {
    return await deps.checkpointSync.run();
  } catch (error) {
    // The source holds an event this build cannot read: the legacy run turns the copy into a full
    // one by a tolerant pull from the start, outbox kept, as on a flag rollback (bug-lessons 361).
    if (isSyncError(error, SOURCE_UNREADABLE)) {
      return await runLegacySync(deps);
    }
    throw error;
  }
};
export const runSync = async (
  deps: SyncDeps,
  status: StoreApi<SyncStatus>,
): Promise<Result<SyncSummary, string>> => {
  try {
    const { summary, rejected } = await chosenRun(deps);
    status.setState({
      lastError: rejected.length === 0 ? null : `push rejected: ${rejected.join(", ")}`,
      lastSyncAt: deps.now(),
      online: true,
      syncing: false,
    });
    return ok(summary);
  } catch (error) {
    if (isSyncError(error, COPY_CHANGED)) {
      deps.onCopyChanged?.();
    }
    if (isStoreBusy(error)) {
      // Transient: the run failed (the loop backs off), the status keeps what the last run said.
      status.setState({ online: true, syncing: false });
      return err(STORE_BUSY);
    }
    status.setState({ lastError: describe(error), online: !isUnreachable(error), syncing: false });
    return err(describe(error));
  }
};
export const shouldPullFor = async (deps: SyncDeps, page: PullPage): Promise<boolean> => {
  await deps.state.ready;
  if (deps.checkpointSync === undefined || !(await deps.checkpointSync.enabled())) {
    return await shouldPullLegacy(deps, page);
  }
  try {
    return await deps.checkpointSync.ingestLive(page);
  } catch (error) {
    // A pull runs the sync, which leaves the checkpoint the tolerant way (bug-lessons 361).
    if (isSyncError(error, SOURCE_UNREADABLE)) {
      return true;
    }
    throw error;
  }
};

import type { StoreApi } from "zustand/vanilla";

import { err, ok, type Result } from "@pace/core";

import type { SyncDeps, SyncRun, SyncStatus, SyncSummary } from "./sync-types.ts";

import { runLegacySync, shouldPullLegacy } from "./legacy-sync-run.ts";
import { COPY_CHANGED, isSyncError } from "./sync-error.ts";
import { isStoreBusy, isUnreachable, type PullPage, STORE_BUSY } from "./sync-transport.ts";

export type { SyncDeps, SyncStatus, SyncSummary } from "./sync-types.ts";
const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
/** The checkpoint run for a copy that syncs from one (`CheckpointSync.enabled`), else the legacy run. */
const chosenRun = async (deps: SyncDeps): Promise<SyncRun> => {
  await deps.state.ready;
  return deps.checkpointSync !== undefined && (await deps.checkpointSync.enabled())
    ? await deps.checkpointSync.run()
    : await runLegacySync(deps);
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
  return deps.checkpointSync !== undefined && (await deps.checkpointSync.enabled())
    ? await deps.checkpointSync.ingestLive(page)
    : await shouldPullLegacy(deps, page);
};

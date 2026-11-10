import type { PaceRuntime } from "#app/runtime.ts";

import { downloadXlsx } from "#app/platform/xlsx.web.ts";
import { completeHistoryOf, COPY_CHANGED, exportSheets, type HistoryError } from "@pace/client";
import { err, ok, type Result } from "@pace/core";

type Runtime = Pick<PaceRuntime, "clock" | "history" | "state" | "sync">;
type Pin = { readonly copy: number; readonly identity: ReturnType<Runtime["state"]["localCopy"]> };
const isCurrentCopy = (state: Runtime["state"], pin: Pin): boolean => {
  const current = state.localCopy();
  return (
    pin.identity !== undefined &&
    state.copy() === pin.copy &&
    current?.copyToken === pin.identity.copyToken &&
    current.owner === pin.identity.owner &&
    current.storeId === pin.identity.storeId
  );
};

/** The export refuses rather than writes a file that is not the account: why, in a code. */
export type ExportError = "export/not-synced" | "export/unavailable" | HistoryError;

/**
A copy that has never reached the server (a fresh tab whose first pull failed) holds none of the
account: its "complete history" is empty only because nothing came. It is synced first; if that
cannot be done, the export says so instead of downloading an empty workbook as a success (QA
PR55-1-01). A copy that synced once exports from the device, offline included.
*/
const reachedServer = async ({
  state,
  sync,
}: Pick<Runtime, "state" | "sync">): Promise<Result<void, ExportError>> => {
  const hasReached = (): boolean => typeof state.localCopy()?.storeId === "string";
  if (hasReached()) {
    return ok(undefined);
  }
  await sync.syncNow();
  if (hasReached()) {
    return ok(undefined);
  }
  return err(sync.status.getState().online ? "export/not-synced" : "history/offline");
};

/** The complete history of the copy this export began on, as a workbook. */
const downloadComplete = async ({
  clock,
  history,
  state,
}: Runtime): Promise<Result<string, ExportError>> => {
  const pin: Pin = { copy: state.copy(), identity: state.localCopy() };
  const loaded = await history.ensureComplete();
  if (!loaded.ok) {
    return loaded;
  }
  if (!isCurrentCopy(state, pin)) {
    return err(COPY_CHANGED);
  }
  const source = completeHistoryOf(state.store.getState());
  if (!source.ok) {
    return source;
  }
  const now = clock.now();
  const file = `pace-${now.slice(0, 10)}.xlsx`;
  await downloadXlsx(exportSheets(source.value, now), file);
  return ok(file);
};

/** Keep the initiating account/copy pinned across history loading before downloading any rows. */
export const exportData = async (runtime: Runtime): Promise<Result<string, ExportError>> => {
  try {
    const reached = await reachedServer(runtime);
    return reached.ok ? await downloadComplete(runtime) : reached;
  } catch {
    return err("export/unavailable");
  }
};

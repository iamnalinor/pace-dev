import type { PaceRuntime } from "#app/runtime.ts";

import { downloadXlsx } from "#app/platform/xlsx.web.ts";
import { completeHistoryOf, exportSheets, type HistoryError } from "@pace/client";
import { err, ok, type Result } from "@pace/core";

type Runtime = Pick<PaceRuntime, "clock" | "history" | "state">;
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

/** Keep the initiating account/copy pinned across history loading before downloading any rows. */
export const exportData = async ({
  clock,
  history,
  state,
}: Runtime): Promise<Result<string, "export/unavailable" | HistoryError>> => {
  const pin: Pin = { copy: state.copy(), identity: state.localCopy() };
  try {
    const loaded = await history.ensureComplete();
    if (!loaded.ok) {
      return loaded;
    }
    if (!isCurrentCopy(state, pin)) {
      return err("sync/copy-changed");
    }
    const source = completeHistoryOf(state.store.getState());
    if (!source.ok) {
      return source;
    }
    const now = clock.now();
    const file = `pace-${now.slice(0, 10)}.xlsx`;
    await downloadXlsx(exportSheets(source.value, now), file);
    return ok(file);
  } catch {
    return err("export/unavailable");
  }
};

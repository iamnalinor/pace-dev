import type { StoreApi } from "zustand/vanilla";

import type { createQueue, LocalLog } from "./local-log.ts";
import type { StoreChange } from "./peer-tabs.ts";
import type { AppState, AppStateHandle, AppStateOptions } from "./state-types.ts";

export const createAnnounce =
  (options: AppStateOptions) =>
  (change: StoreChange): void => {
    void (async () => {
      try {
        const snapshot = await options.store.readSnapshot();
        options.onStored?.({
          ...change,
          copyToken: snapshot.copyToken,
          storeId: snapshot.storeId,
          owner: snapshot.owner,
        });
      } catch {
        /* Peer hints are best effort; the caller of sync/reload receives persistent read failures. */
      }
    })();
  };
export const createCopyControls = ({
  log,
  enqueue,
  store,
  announce,
}: {
  readonly log: LocalLog;
  readonly enqueue: ReturnType<typeof createQueue>;
  readonly store: StoreApi<AppState>;
  readonly announce: (change: StoreChange) => void;
}): Pick<AppStateHandle, "claim" | "clear" | "commitSnapshot" | "copy"> => {
  const epoch = { value: 0 };
  return {
    commitSnapshot: async (operation, shouldReplaceCopy) => {
      if (shouldReplaceCopy === true) {
        epoch.value += 1;
        log.invalidate();
      }
      return await enqueue(async () => {
        await log.settled();
        const result = await operation();
        if (result.ok) {
          await log.reload();
        }
        return result;
      });
    },
    clear: async (ifOwner) => {
      epoch.value += 1;
      await enqueue(async () => {
        await log.clear(ifOwner);
      });
      // The other tabs share the store that was just emptied: they read it again.
      announce({ kind: "reload" });
    },
    claim: async (mark) => {
      if (log.snapshot()?.owner !== mark) {
        epoch.value += 1;
      }
      await enqueue(async () => {
        await log.claim(mark);
        store.setState({
          historyStatus: store.getState().historyCoverage === "full" ? "ready" : "idle",
          historyError: null,
        });
      });
    },
    copy: () => epoch.value,
  };
};

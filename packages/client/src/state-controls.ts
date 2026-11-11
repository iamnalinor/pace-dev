import type { StoreApi } from "zustand/vanilla";

import type { Result } from "@pace/core";

import type { LegacyPageChange } from "./checkpoint-store-types.ts";
import type { createQueue, LocalLog } from "./local-log.ts";
import type { StoreChange } from "./peer-tabs.ts";
import type { AppState, AppStateHandle, AppStateOptions } from "./state-types.ts";

/** Hints carry the copy this state holds in memory: telling the other tabs reads no disk. */
export const createAnnounce =
  (options: AppStateOptions, held: LocalLog["snapshot"]) =>
  (change: StoreChange): void => {
    const copy = held();
    if (copy !== undefined) {
      options.onStored?.({
        ...change,
        copyToken: copy.copyToken,
        storeId: copy.storeId,
        owner: copy.owner,
      });
    }
  };
/**
Shows a legacy page on top of the log and tells the other tabs its events. A page that changed
the copy's identity (its first store id, another server generation) has them read the disk: they
hold the old identity, and take in events of the one they hold only. A page that turned a
checkpoint's copy into a full one is read back whole, once: what stays of the old copy is its
outbox, which only the disk knows.
*/
const showLegacyPage =
  (log: LocalLog, announce: (change: StoreChange) => void) =>
  async (change: LegacyPageChange): Promise<void> => {
    if (change.isConverted) {
      await log.reload();
      announce({ kind: "reload" });
      return;
    }
    const before = log.snapshot();
    log.applyLegacyPage(change);
    if (before?.copyToken !== change.meta.copyToken || before.storeId !== change.meta.storeId) {
      announce({ kind: "reload" });
    } else if (change.events.length > 0) {
      announce({ events: change.events, kind: "events" });
    }
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
}): Pick<AppStateHandle, "claim" | "clear" | "commitLegacyPage" | "commitSnapshot" | "copy"> => {
  const epoch = { value: 0 };
  /** The store's answer is shown as it is: what it committed is never read back (class 259). */
  const commit = async <T, E>(
    operation: () => Promise<Result<T, E>>,
    options: {
      readonly shouldReplaceCopy: boolean | undefined;
      readonly show: (value: T) => Promise<void> | void;
    },
  ): Promise<Result<T, E>> => {
    if (options.shouldReplaceCopy === true) {
      epoch.value += 1;
      log.invalidate();
    }
    return await enqueue(async () => {
      await log.settled();
      const result = await operation();
      if (result.ok) {
        await options.show(result.value);
      }
      return result;
    });
  };
  return {
    commitSnapshot: async (operation, shouldReplaceCopy) =>
      await commit(operation, { shouldReplaceCopy, show: log.install }),
    commitLegacyPage: async (operation, shouldReplaceCopy) =>
      await commit(operation, { shouldReplaceCopy, show: showLegacyPage(log, announce) }),
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
          history: { status: store.getState().historyCoverage === "full" ? "ready" : "idle" },
        });
      });
    },
    copy: () => epoch.value,
  };
};

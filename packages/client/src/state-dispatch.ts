import type { StoreApi } from "zustand/vanilla";

import { err, type Event, ok, type Result } from "@pace/core";

import type { LocalLog } from "./local-log.ts";
import type { AppState, AppStateHandle } from "./state-types.ts";

import { createRevocations } from "./revocations.ts";

const latestOwn = (events: readonly Event[], deviceId: string): Event | undefined =>
  events
    .filter((event) => event.deviceId === deviceId)
    .toSorted((a, b) => `${b.recordedAt}${b.id}`.localeCompare(`${a.recordedAt}${a.id}`))
    .at(0);

export const createEventActions = ({
  stage,
  ready,
  ensureHistory,
  log,
  now,
  store,
  deviceId,
}: {
  readonly stage: AppStateHandle["stage"];
  readonly ready: Promise<void>;
  readonly ensureHistory: AppStateHandle["ensureHistory"];
  readonly log: LocalLog;
  readonly now: () => string;
  readonly store: StoreApi<AppState>;
  readonly deviceId: string;
}): Pick<AppStateHandle, "dispatch" | "revoke" | "revokeAll" | "undoLast"> => {
  const dispatch: AppStateHandle["dispatch"] = async (input) => {
    const staged = await stage([input]);
    if (!staged.ok) {
      return staged;
    }
    const written = await staged.value.persisted;
    const [event] = staged.value.events;
    return event !== undefined && written.ok ? ok(event) : err("persist_failed");
  };

  // A revocation needs the complete history: its target may sit behind the checkpoint.
  const historyLoaded = async (): Promise<Result<void, string>> => {
    await ready;
    return await ensureHistory();
  };
  const revocations = createRevocations({
    hasEvent: (eventId) => log.has(eventId),
    log: () => store.getState().log,
    now,
    ready,
    stage,
  });
  const revokeAll: AppStateHandle["revokeAll"] = async (eventIds) => {
    const history = await historyLoaded();
    return history.ok ? await revocations.revokeAll(eventIds) : history;
  };
  const revoke: AppStateHandle["revoke"] = async (eventId) => {
    const history = await historyLoaded();
    return history.ok ? await revocations.revoke(eventId) : history;
  };

  return {
    dispatch,
    revoke,
    revokeAll,
    undoLast: async () => {
      const history = await historyLoaded();
      if (!history.ok) {
        return history;
      }
      const target = latestOwn(store.getState().events, deviceId);
      return target === undefined ? err("undo/nothing") : await revoke(target.id);
    },
  };
};

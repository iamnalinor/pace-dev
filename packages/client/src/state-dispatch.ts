import type { StoreApi } from "zustand/vanilla";

import { err, type Event, ok } from "@pace/core";

import type { LocalLog } from "./local-log.ts";
import type { AppState, AppStateHandle } from "./state-types.ts";

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
}): Pick<AppStateHandle, "dispatch" | "revoke" | "undoLast"> => {
  const dispatch: AppStateHandle["dispatch"] = async (input) => {
    const staged = await stage([input]);
    if (!staged.ok) {
      return staged;
    }
    const written = await staged.value.persisted;
    const [event] = staged.value.events;
    return event !== undefined && written.ok ? ok(event) : err("persist_failed");
  };

  const revoke: AppStateHandle["revoke"] = async (eventId) => {
    await ready;
    const history = await ensureHistory();
    if (!history.ok) {
      return history;
    }
    if (!log.has(eventId)) {
      return err("event/not-found");
    }
    return await dispatch({
      occurredAt: now(),
      payload: { targetId: eventId },
      type: "event.revoked",
    });
  };

  return {
    dispatch,
    revoke,
    undoLast: async () => {
      await ready;
      const history = await ensureHistory();
      if (!history.ok) {
        return history;
      }
      const target = latestOwn(store.getState().events, deviceId);
      return target === undefined ? err("undo/nothing") : await revoke(target.id);
    },
  };
};

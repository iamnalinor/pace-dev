import { err, type Event, ok } from "@pace/core";

import type { createQueue, LocalLog, Persisted } from "./local-log.ts";
import type { StoreChange } from "./peer-tabs.ts";
import type { AppState, AppStateHandle, AppStateOptions as Options } from "./state-types.ts";

import { batchInstant, parseBatch } from "./batch.ts";
import { requiresSourceForEvent } from "./checkpoint-validation.ts";

/**
The device's write instants: each batch gets one of its own, later than the one before it on this
device (`batchInstant`), so `deviceId` + `recordedAt` names one write (owner R27-05). Taken when
the batch is prepared: prepares run in call order, so the instants rise in it.
*/
export const createBatchClock = (now: () => string): (() => string) => {
  let previous: null | string = null;
  return () => {
    previous = batchInstant(now(), previous);
    return previous;
  };
};

/**
Changes from outside this tab's own writes (another tab, another writer); the other tabs hear
only what this state itself put into the store.
*/
export const externalChanges = (
  log: LocalLog,
  enqueue: ReturnType<typeof createQueue>,
  onStored: ((change: StoreChange) => void) | undefined,
): Pick<AppStateHandle, "adoptPeerChange" | "rematerialize"> => ({
  adoptPeerChange: async (change) => {
    await enqueue(async () => {
      await log.adoptPeer(change);
    });
  },
  rematerialize: async () => {
    await enqueue(log.reload);
    onStored?.({ kind: "reload" });
  },
});

const stageRefusal = (
  {
    log,
    ids,
    current,
  }: { readonly log: LocalLog; readonly ids: ReadonlySet<string>; readonly current: AppState },
  event: Event,
): null | string => {
  if (ids.has(event.id) || log.has(event.id)) {
    return "event/duplicate";
  }
  return current.checkpoint !== null && requiresSourceForEvent(current.checkpoint, event)
    ? "history/not-loaded"
    : null;
};
/**
Tells the other tabs and the sync once the write landed: only what is on the disk can be adopted
by a tab sharing the store, or sent.
*/
const announced = async (persisted: Persisted, options: Options): Persisted => {
  const written = await persisted;
  if (written.ok) {
    options.onStored?.({ events: written.value, kind: "events" });
    options.onLocal?.();
  }
  return written;
};

/**
The inputs as the events they will be: each envelope is filled and parsed once, every event of the
batch recorded at one instant of the device's batch clock unless the caller set its own.
*/
export const createPrepare =
  (options: Options, nextInstant: () => string): AppStateHandle["prepare"] =>
  (inputs) =>
    parseBatch(inputs, { ...options, recordedAt: nextInstant() }, () => false);

/**
Checks every event against the log and the caller's `refusal` (a refusal shows nothing), then
shows them all and starts their write.
*/
export const createStageEvents =
  (
    log: LocalLog,
    enqueue: ReturnType<typeof createQueue>,
    options: Options & { readonly current: () => AppState },
  ): AppStateHandle["stageEvents"] =>
  async (events, refusal) =>
    await enqueue(() => {
      if (options.current().status !== "ready") {
        return err("history/not-loaded");
      }
      // The caller's check, in the queue: on the state every earlier write left (review I4).
      const refused = refusal?.() ?? null;
      if (refused !== null) {
        return err(refused);
      }
      const ids = new Set<string>();
      for (const event of events) {
        const refusal = stageRefusal({ log, ids, current: options.current() }, event);
        if (refusal !== null) {
          return err(refusal);
        }
        ids.add(event.id);
      }
      // Not awaited here: the next action integrates while this write is on its way.
      return ok({ events, persisted: announced(log.persistLocal(events), options) });
    });

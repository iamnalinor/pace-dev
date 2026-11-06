import { err, type Event, newId, ok, parseEvent, type Result } from "@pace/core";

import type { HistoryError } from "./history-types.ts";
import type { createQueue, LocalLog, Persisted } from "./local-log.ts";
import type { StoreChange } from "./peer-tabs.ts";
import type {
  AppState,
  AppStateHandle,
  DispatchInput,
  AppStateOptions as Options,
} from "./state-types.ts";

import { requiresSourceForEvent } from "./checkpoint-validation.ts";
/** Fills what the caller left out: the store owns the envelope. */
const envelope = (
  input: DispatchInput,
  defaults: { readonly deviceId: string; readonly now: () => string; readonly source: string },
): unknown => ({
  precision: "exact",
  source: defaults.source,
  ...input,
  deviceId: input.deviceId ?? defaults.deviceId,
  id: input.id ?? newId(),
  recordedAt: input.recordedAt ?? defaults.now(),
});

/**
Changes from outside this tab's own writes (the server, another tab, another writer); the other
tabs hear only what this state itself put into the store.
*/
export const externalChanges = (
  log: LocalLog,
  enqueue: ReturnType<typeof createQueue>,
  options: {
    readonly onStored: ((change: StoreChange) => void) | undefined;
    readonly ensureHistory: () => Promise<Result<void, HistoryError>>;
    readonly current: () => AppState;
  },
): Pick<AppStateHandle, "adoptPeerChange" | "ingest" | "rematerialize"> => ({
  adoptPeerChange: async (change) => {
    await enqueue(async () => {
      await log.adoptPeer(change);
    });
  },
  ingest: async (events) => {
    const current = options.current();
    if (
      current.historyCoverage === "checkpoint" &&
      events.some(
        (event) =>
          current.checkpoint === null ||
          requiresSourceForEvent(current.checkpoint, event) ||
          current.checkpoint.eventIds.includes(event.id),
      )
    ) {
      const history = await options.ensureHistory();
      if (!history.ok) {
        throw new Error(history.error);
      }
    }
    const { persisted } = await enqueue(() => ({ persisted: log.persistRemote(events) }));
    const written = await persisted;
    if (!written.ok) {
      throw new Error(written.error);
    }
    if (written.value.length > 0) {
      options.onStored?.({ events: written.value, kind: "events" });
    }
  },
  rematerialize: async () => {
    await enqueue(log.reload);
    options.onStored?.({ kind: "reload" });
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

/** Validates every input (a refusal shows nothing), then shows them all and starts their write. */
export const createStage =
  (
    log: LocalLog,
    enqueue: ReturnType<typeof createQueue>,
    options: Options & { readonly current: () => AppState },
  ): AppStateHandle["stage"] =>
  async (inputs) =>
    await enqueue(() => {
      if (options.current().status !== "ready") {
        return err("history/not-loaded");
      }
      const events: Event[] = [];
      const ids = new Set<string>();
      for (const input of inputs) {
        const parsed = parseEvent(envelope(input, options));
        if (!parsed.ok) {
          return parsed;
        }
        const refusal = stageRefusal({ log, ids, current: options.current() }, parsed.value);
        if (refusal !== null) {
          return err(refusal);
        }
        ids.add(parsed.value.id);
        events.push(parsed.value);
      }
      // Not awaited here: the next action integrates while this write is on its way.
      return ok({ events, persisted: announced(log.persistLocal(events), options) });
    });

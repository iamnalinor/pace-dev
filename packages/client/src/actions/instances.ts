import {
  autoOutcomeEvents,
  type EventInput,
  missingInstanceEvents,
  missingSeriesEvents,
  validateEventInput,
} from "@pace/core";

import type { Persisted } from "../local-log.ts";
import type { ActionDeps } from "./deps.ts";

export type InstanceActions = {
  /**
  Appends the homework instances due this week and the automatic outcomes whose time
  has come, as system events with deterministic ids; returns how many were added.
  Call it on open and on foreground.
  */
  readonly ensureInstances: () => Promise<number>;
};

/**
The complete source, asked for at most once per `ensureInstances`: a system event dated at or
before a checkpoint's last event needs it, as any backdated event does. Without it (offline) the
event is left for the next call; the others are still written.
*/
type Source = { readonly load: () => Promise<boolean> };

const sourceOnce = (deps: ActionDeps): Source => {
  let loading: Promise<boolean> | undefined;
  return {
    load: async () => {
      loading ??= (async () => {
        const history = await deps.state.ensureHistory();
        return history.ok;
      })();
      return await loading;
    },
  };
};

/** Stages one system event; one the copy's base cannot take is staged again once the source came. */
const stageSystem = async (deps: ActionDeps, input: EventInput, source: Source) => {
  const staged = await deps.state.stage([input]);
  return !staged.ok && staged.error === "history/not-loaded" && (await source.load())
    ? await deps.state.stage([input])
    : staged;
};

/** System events are appended one by one: an invalid or already known one is skipped, not fatal. */
const appendSystem = async (
  deps: ActionDeps,
  inputs: readonly EventInput[],
  source: Source,
): Promise<number> => {
  const snapshot = deps.state.store.getState();
  const now = deps.clock.now();
  const known = snapshot.knownEventIds;
  const fresh = inputs.filter(
    (input) =>
      (input.id === undefined || !known.has(input.id)) &&
      validateEventInput(snapshot, input, now).ok,
  );
  // Each is shown at once; the writes follow one after another, and only the landed ones count.
  const writes: Persisted[] = [];
  for (const input of fresh) {
    const staged = await stageSystem(deps, input, source);
    if (staged.ok) {
      writes.push(staged.value.persisted);
    }
  }
  const written = await Promise.all(writes);
  return written.filter((write) => write.ok).length;
};

/** Every id in the log, revoked ones included: a taken-back instance is not made again. */
const idsOf = (state: { readonly knownEventIds: ReadonlySet<string> }): ReadonlySet<string> =>
  state.knownEventIds;

export const instanceActions = (deps: ActionDeps): InstanceActions => ({
  ensureInstances: async () => {
    await deps.state.ready;
    if (deps.state.store.getState().status !== "ready") {
      return 0;
    }
    const now = deps.clock.now();
    const source = sourceOnce(deps);
    const before = deps.state.store.getState();
    const instances = await appendSystem(
      deps,
      missingInstanceEvents({ ...before, existingEventIds: idsOf(before), now }),
      source,
    );
    const seriesBefore = deps.state.store.getState();
    const series = await appendSystem(
      deps,
      missingSeriesEvents({ ...seriesBefore, existingEventIds: idsOf(seriesBefore), now }),
      source,
    );
    // The outcomes are read after the instances: a fresh instance cannot be due yet, but a
    // revoked and recreated one keeps its id out of the "already emitted" set otherwise.
    const after = deps.state.store.getState();
    const outcomes = await appendSystem(
      deps,
      autoOutcomeEvents({ ...after, existingEventIds: idsOf(after), now }),
      source,
    );
    // A course whose last instance an outcome just closed gets its next one ahead.
    const closed = deps.state.store.getState();
    const ahead = await appendSystem(
      deps,
      missingInstanceEvents({ ...closed, existingEventIds: idsOf(closed), now }),
      source,
    );
    return instances + series + outcomes + ahead;
  },
});

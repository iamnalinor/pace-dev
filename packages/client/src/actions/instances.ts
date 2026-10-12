import {
  autoOutcomeEvents,
  type EventInput,
  missingInstanceEvents,
  validateEventInput,
} from "@pace/core";

import type { ActionDeps } from "./deps.ts";

export type InstanceActions = {
  /**
  Appends the homework instances due this week and the automatic outcomes whose time
  has come, as system events with deterministic ids; returns how many were added.
  Call it on open and on foreground.
  */
  readonly ensureInstances: () => Promise<number>;
};

/** System events are appended one by one: an invalid or already known one is skipped, not fatal. */
const appendSystem = async (deps: ActionDeps, inputs: readonly EventInput[]): Promise<number> => {
  const snapshot = deps.state.store.getState();
  const now = deps.clock.now();
  const known = new Set(snapshot.log.map((event) => event.id));
  const fresh = inputs.filter(
    (input) =>
      (input.id === undefined || !known.has(input.id)) &&
      validateEventInput(snapshot, input, now).ok,
  );
  let added = 0;
  for (const input of fresh) {
    const dispatched = await deps.state.dispatch(input);
    if (dispatched.ok) {
      added += 1;
    }
  }
  return added;
};

/** Every id in the log, revoked ones included: a taken-back instance is not made again. */
const idsOf = (state: { readonly log: readonly { readonly id: string }[] }): ReadonlySet<string> =>
  new Set(state.log.map((event) => event.id));

export const instanceActions = (deps: ActionDeps): InstanceActions => ({
  ensureInstances: async () => {
    const now = deps.clock.now();
    const before = deps.state.store.getState();
    const instances = await appendSystem(
      deps,
      missingInstanceEvents({ ...before, existingEventIds: idsOf(before), now }),
    );
    // The outcomes are read after the instances: a fresh instance cannot be due yet, but a
    // revoked and recreated one keeps its id out of the "already emitted" set otherwise.
    const after = deps.state.store.getState();
    const outcomes = await appendSystem(
      deps,
      autoOutcomeEvents({ ...after, existingEventIds: idsOf(after), now }),
    );
    // A course whose last instance an outcome just closed gets its next one ahead.
    const closed = deps.state.store.getState();
    const ahead = await appendSystem(
      deps,
      missingInstanceEvents({ ...closed, existingEventIds: idsOf(closed), now }),
    );
    return instances + outcomes + ahead;
  },
});

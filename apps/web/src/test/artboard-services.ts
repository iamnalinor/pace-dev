import type { Clock } from "@pace/client";

import { artboardEvents, MOSCOW, NOW } from "@pace/core/testing";

import { createTestServices } from "./services.ts";

type Options = {
  readonly now?: string;
  readonly deviceTz?: string;
};

/** A clock frozen at the artboard instant in Moscow, so every relative figure matches the design. */
export const frozenClock = ({ deviceTz = MOSCOW, now = NOW }: Options = {}): Clock => ({
  deviceTz,
  now: () => now,
});

/** Services whose clock never moves (the store stays empty). */
export const frozenServices = (options: Options = {}) =>
  createTestServices({ clock: frozenClock(options) });

/**
Services on the frozen clock with the artboard world ingested as synced events, up to the
clock's instant: what happened later (TRK-231's Wednesday re-prioritization) is not there.
*/
export const artboardServices = async (options: Options = {}) => {
  const world = frozenServices(options);
  const until = options.now ?? NOW;
  await world.services.state.ingest(artboardEvents().filter((event) => event.occurredAt <= until));
  return world;
};

import { vi } from "vitest";

import type { PaceServices } from "#web/services.ts";

import { artboardEvents, NOW } from "@pace/core/testing";

/**
Freezes `Date` at the artboard instant (Tuesday, October 6 2026, 15:00 Moscow) so every
relative figure matches the design, and leaves timers real for user-event.
*/
export const freezeAt = (iso: string = NOW): void => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

/** Replays the artboard world into the services' store as synced events. */
export const seedArtboard = async (services: PaceServices): Promise<void> => {
  await services.state.ingest(artboardEvents());
};

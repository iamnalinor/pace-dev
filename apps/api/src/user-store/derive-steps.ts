import { autoOutcomeEvents, missingInstanceEvents, missingSeriesEvents } from "@pace/core";

/**
What the store derives at a moment, in order: the homework instances of the week, then the
automatic outcomes whose deadline passed, then the instances again (a course whose last
instance an outcome just closed gets its next one ahead).
*/
/** One derive step: the system events the state calls for at `now`. */
export type DeriveStep = (typeof DERIVE_STEPS)[number];

export const DERIVE_STEPS = [
  missingInstanceEvents,
  missingSeriesEvents,
  autoOutcomeEvents,
  missingInstanceEvents,
] as const;

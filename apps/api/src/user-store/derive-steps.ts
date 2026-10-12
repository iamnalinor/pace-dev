import { autoOutcomeEvents, missingInstanceEvents } from "@pace/core";

/**
What the store derives at a moment, in order: the homework instances of the week, then the
automatic outcomes whose deadline passed, then the instances again (a course whose last
instance an outcome just closed gets its next one ahead).
*/
export const DERIVE_STEPS = [
  missingInstanceEvents,
  autoOutcomeEvents,
  missingInstanceEvents,
] as const;

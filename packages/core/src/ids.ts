import { isValid, monotonicFactory } from "ulidx";

/** Random source in `[0, 1)`; injectable so tests can make ids deterministic. */
export type Prng = () => number;

export type IdFactory = (seedTime?: number) => string;

/**
 * ULIDs sort by creation time and stay unique within one millisecond thanks to the
 * monotonic counter. One factory per process keeps the counter shared.
 */
export const createIdFactory = (prng?: Prng): IdFactory => {
  const make = monotonicFactory(prng);
  return (seedTime?: number): string => make(seedTime);
};

export const newId: IdFactory = createIdFactory();

export const isUlid = (value: string): boolean => isValid(value);

/** Homework instances are system-generated once per preset and ISO week. */
export const instanceId = (presetId: string, isoWeek: string): string =>
  `hw:${presetId}:${isoWeek}`;

export type AutoOutcomeKind = "missed" | "skipped";

/** Automatic outcomes are system-generated once per task and kind. */
export const autoOutcomeId = (taskId: string, kind: AutoOutcomeKind): string =>
  `auto:${taskId}:${kind}`;

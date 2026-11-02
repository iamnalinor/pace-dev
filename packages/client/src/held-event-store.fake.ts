import type { Event } from "@pace/core";

import type { EventStore } from "./event-store.ts";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";

/** One `append` the test holds: it lands in the memory store only when the test resolves it. */
export type HeldWrite = {
  readonly events: readonly Event[];
  readonly resolve: () => Promise<void>;
  readonly reject: () => void;
};

export type HeldEventStore = {
  readonly store: EventStore;
  /** Every append so far, in the order the log called it, settled or not. */
  readonly writes: readonly HeldWrite[];
  /** Lets appends through at once again (seeding, loading). */
  readonly release: () => void;
  /** Holds every append from now on until the test settles it. */
  readonly hold: () => void;
};

/**
A memory event store whose writes the test holds pending, then lets land or refuses (bug-lessons
class 3: pending → resolved → refused), the way a slow or full disk answers.
*/
export const createHeldEventStore = (): HeldEventStore => {
  const inner = createMemoryEventStore();
  const writes: HeldWrite[] = [];
  let isHolding = false;
  const append = async (events: readonly Event[]): Promise<void> => {
    if (!isHolding) {
      await inner.append(events);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      writes.push({
        events,
        reject: () => {
          reject(new Error("QuotaExceededError"));
        },
        resolve: async () => {
          await inner.append(events);
          resolve();
          // Let the log's continuation run before the test looks again.
          await Promise.resolve();
        },
      });
    });
  };
  return {
    hold: () => {
      isHolding = true;
    },
    release: () => {
      isHolding = false;
    },
    store: { ...inner, append },
    writes,
  };
};

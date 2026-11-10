import type { Event } from "@pace/core";

import type { CopyGuard } from "./checkpoint-store-types.ts";
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
  const perform = async <T>(events: readonly Event[], operation: () => Promise<T>): Promise<T> => {
    if (!isHolding || events.length === 0) {
      return await operation();
    }
    return await new Promise<T>((resolve, reject) => {
      writes.push({
        events,
        reject: () => {
          reject(new Error("QuotaExceededError"));
        },
        resolve: async () => {
          try {
            resolve(await operation());
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
          await Promise.resolve();
        },
      });
    });
  };
  const append = async (events: readonly Event[], guard: CopyGuard): Promise<void> => {
    await perform(events, async () => {
      await inner.append(events, guard);
    });
  };

  return {
    hold: () => {
      isHolding = true;
    },
    release: () => {
      isHolding = false;
    },
    store: {
      ...inner,
      append,
      applyLegacyPage: async (input) =>
        await perform(input.events, async () => await inner.applyLegacyPage(input)),
      applyRemotePage: async (input) =>
        await perform(
          input.records.map((record) => record.event),
          async () => await inner.applyRemotePage(input),
        ),
      installBootstrap: async (input) =>
        await perform(
          input.records.map((record) => record.event),
          async () => await inner.installBootstrap(input),
        ),
      installHistory: async (input) =>
        await perform(
          input.sourceRecords.map((record) => record.event),
          async () => await inner.installHistory(input),
        ),
    },
    writes,
  };
};

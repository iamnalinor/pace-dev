import { createMemoryEventStore, type EventStore } from "@pace/client";

/** A memory event store that refuses every write once told to, as a full disk would. */
export type RefusingStore = {
  readonly eventStore: EventStore;
  /** From now on every write is refused. */
  readonly refuse: () => void;
  /** The size of each refused write, in order: a retry loop shows here. */
  readonly refused: readonly number[];
};

/**
The real store path for a refused local write (bug-lessons 108): the action shows at once, its
write is refused, the state takes it back and the action answers `persist_failed`.
*/
export const refusingStore = (): RefusingStore => {
  const memory = createMemoryEventStore();
  const refused: number[] = [];
  let isRefusing = false;
  return {
    eventStore: {
      ...memory,
      append: async (events) => {
        if (isRefusing) {
          refused.push(events.length);
          throw new Error("QuotaExceededError");
        }
        await memory.append(events);
      },
    },
    refuse: () => {
      isRefusing = true;
    },
    refused,
  };
};

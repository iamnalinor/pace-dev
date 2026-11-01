import { armEarliest } from "./alarm.ts";

/** How soon a delivery that did not go through is tried again. */
const RETRY_MS = 60_000;

/** Arms a retry without replacing an earlier alarm. */
export const armRetry = async (storage: DurableObjectStorage, now: string): Promise<void> => {
  await armEarliest(storage, Date.parse(now) + RETRY_MS);
};

/**
The next pool decision or an outstanding delivery retry, whichever comes first. It never deletes
or postpones the alarm: the store's other waits (the assistant's queue, automatic sleep) share it.
*/
export const scheduleNextPass = async (
  storage: DurableObjectStorage,
  {
    now,
    nextAt,
    isRetry,
  }: { readonly now: string; readonly nextAt: null | string; readonly isRetry: boolean },
): Promise<void> => {
  const next = nextAt === null ? null : Date.parse(nextAt);
  const at = isRetry ? Math.min(next ?? Infinity, Date.parse(now) + RETRY_MS) : next;
  if (at !== null) {
    await armEarliest(storage, at);
  }
};

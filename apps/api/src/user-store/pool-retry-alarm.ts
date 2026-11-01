import { armEarliest } from "./alarm.ts";

/** How soon a delivery that did not go through is tried again. */
const RETRY_MS = 60_000;

/**
The longest the pool waits between passes: a day, within the three days of calendar a pass reads
(`pool-service.ts`), so an event enters a pass's window before it starts even when no write and no
change of the calendar asks for a pass, and a time left by older rules heals within a day. A pass
that finds nothing coming (no digest window, no event near) still looks again by then.
*/
const LOOK_AGAIN_MS = 24 * 60 * 60_000;

/**
Storage key of when the pool next wants a pass (epoch ms; `null` while a pass has taken it): the
store's alarm also fires for sleep's looks and the assistant's queue, and a pass loads the whole
log on a cold instance, so `alarm()` runs one only once this has come. A store from before the key
has none, and passes at its next alarm.
*/
export const POOL_NEXT_AT_KEY = "pool:next-at";

/** Asks for a pass at `at`, never later than one the pool already waits for. */
const armPool = async (storage: DurableObjectStorage, at: number): Promise<void> => {
  const known = await storage.get<null | number>(POOL_NEXT_AT_KEY);
  if (known !== undefined && (known === null || at < known)) {
    await storage.put(POOL_NEXT_AT_KEY, at);
  }
  await armEarliest(storage, at);
};

/** Arms a retry without replacing an earlier alarm. */
export const armRetry = async (storage: DurableObjectStorage, now: string): Promise<void> => {
  await armPool(storage, Date.parse(now) + RETRY_MS);
};

/** Arms a pass at `at` (an earlier one already armed stays). */
export const armPass = async (storage: DurableObjectStorage, at: string): Promise<void> => {
  await armPool(storage, Date.parse(at));
};

/**
Arms the pool's next pass and answers when it is: the next pool decision or an outstanding
delivery retry, whichever comes first, and never later than a day on (`LOOK_AGAIN_MS`). It never
deletes or postpones the alarm: the store's other waits (the assistant's queue, automatic sleep)
share it.
*/
export const scheduleNextPass = async (
  storage: DurableObjectStorage,
  {
    now,
    nextAt,
    isRetry,
  }: { readonly now: string; readonly nextAt: null | string; readonly isRetry: boolean },
): Promise<string> => {
  const from = Date.parse(now);
  const at = Math.min(
    nextAt === null ? Infinity : Date.parse(nextAt),
    isRetry ? from + RETRY_MS : Infinity,
    from + LOOK_AGAIN_MS,
  );
  await armPool(storage, at);
  return new Date(at).toISOString();
};

/**
Runs a pass, which takes the pool's time: whatever asks for one while it runs (a write, a retry,
its own next decision) arms it again. A pass that fails leaves the pool due without arming
anything (the runtime retries the failed alarm with its own backoff), so the next alarm passes
again.
*/
export const takingPoolTime = async <T>(
  storage: DurableObjectStorage,
  { now, pass }: { readonly now: string; readonly pass: () => Promise<T> },
): Promise<T> => {
  await storage.put(POOL_NEXT_AT_KEY, null);
  try {
    return await pass();
  } catch (error) {
    const known = await storage.get<null | number>(POOL_NEXT_AT_KEY);
    if (known === null || known === undefined || known > Date.parse(now)) {
      await storage.put(POOL_NEXT_AT_KEY, Date.parse(now));
    }
    throw error;
  }
};

/**
The pool's part of `alarm()`: a pass once its own time has come (or when it has none recorded);
before that its time is armed again and nothing is read.
*/
export const poolAtAlarm = async (
  storage: DurableObjectStorage,
  { now, pass }: { readonly now: string; readonly pass: () => Promise<unknown> },
): Promise<void> => {
  const known = await storage.get<null | number>(POOL_NEXT_AT_KEY);
  if (known === null) {
    return;
  }
  if (known !== undefined && known > Date.parse(now)) {
    await armEarliest(storage, known);
    return;
  }
  await pass();
};

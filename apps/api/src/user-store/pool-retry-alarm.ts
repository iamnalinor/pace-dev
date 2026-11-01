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
How long the first pass in a row holds the pool: one whose isolate is reset while it works (a
deploy, the CPU limit) never ends and never says so, and the alarm passes again once its lease has
run out. Each pass taken while the one before did not complete holds it twice as long, up to four
hours (`backoff`).
*/
const LEASE_MS = 5 * 60_000;

/**
Storage key of when the pool next wants a pass (epoch ms; `null` while a pass has taken it): the
store's alarm also fires for sleep's looks and the assistant's queue, and a pass loads the whole
log on a cold instance, so `alarm()` runs one only once this has come. A store from before the key
has none, and passes at its next alarm, armed at once by a write or an upload when it has none
(`armIfPoolUnplanned`).
*/
export const POOL_NEXT_AT_KEY = "pool:next-at";

/**
Storage key of the lease of the pass running (the epoch ms it runs out at): written before the
pass takes the pool's time and removed as it ends, so a pass cut short is found and run again.
*/
export const POOL_LEASE_KEY = "pool:lease";

/** Asks for a pass at `at`, never later than one the pool already waits for. */
const armPool = async (storage: DurableObjectStorage, at: number): Promise<void> => {
  const known = await storage.get<null | number>(POOL_NEXT_AT_KEY);
  if (known !== undefined && (known === null || at < known)) {
    await storage.put(POOL_NEXT_AT_KEY, at);
  }
  await armEarliest(storage, at);
};

/**
Arms the alarm at once on a store whose pool has neither a time nor any alarm: main's last pass
deleted the alarm when nothing was coming and main never wrote the key, and a store just made or
wiped has neither. Nothing would ever pass its pool (bug-lessons class 57): an unchanged calendar
copy wakes nothing, and a write arms only what the pool finds coming. Any alarm already set passes
the pool when it fires (no key reads as due), and that pass records the key, so after it this
reads one value and arms nothing.
*/
export const armIfPoolUnplanned = async (
  storage: DurableObjectStorage,
  now: string,
): Promise<void> => {
  if ((await storage.get(POOL_NEXT_AT_KEY)) === undefined && (await storage.getAlarm()) === null) {
    await storage.setAlarm(Date.parse(now));
  }
};

/** Arms a retry without replacing an earlier alarm. */
export const armRetry = async (storage: DurableObjectStorage, now: string): Promise<void> => {
  await armPool(storage, Date.parse(now) + RETRY_MS);
};

/**
After a write at `now`: arms the pass it calls for at `at` (an earlier one already armed stays),
and one at once when the pool has no time and the store no alarm (`armIfPoolUnplanned`).
*/
export const armAfterWrite = async (
  storage: DurableObjectStorage,
  { at, now }: { readonly at: null | string; readonly now: string },
): Promise<void> => {
  if (at !== null) {
    await armPool(storage, Date.parse(at));
  }
  await armIfPoolUnplanned(storage, now);
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

/** Removes the lease `lease` if it is still the one held (a later pass may hold its own). */
const release = async (storage: DurableObjectStorage, lease: number): Promise<void> => {
  if ((await storage.get<number>(POOL_LEASE_KEY)) === lease) {
    await storage.delete(POOL_LEASE_KEY);
  }
};

/** The longest a pass that keeps failing or being cut short waits before it runs again. */
const RETRY_MAX_MS = 4 * 60 * 60_000;

/**
Storage key of how many passes in a row have not completed, the one running included: counted as
a pass takes the pool, before its work, so a pass cut short (no `catch` runs) counts as much as
one that throws, and cleared by a pass that completes.
*/
const FAILURES_KEY = "pool:failures";

/** `base` doubled for each pass in a row before the `attempt`th that did not complete, up to four hours. */
const backoff = (base: number, attempt: number): number =>
  Math.min(base * 2 ** (attempt - 1), RETRY_MAX_MS);

/**
Arms the pass after the `attempt`th in a row, which failed at `now`: a minute on, doubling while
passes keep failing, up to four hours, or an earlier time a write asked for meanwhile.
*/
const retryAfterFailure = async (
  storage: DurableObjectStorage,
  { attempt, now }: { readonly attempt: number; readonly now: number },
): Promise<void> => {
  const again = now + backoff(RETRY_MS, attempt);
  const known = await storage.get<null | number>(POOL_NEXT_AT_KEY);
  const at = known === null || known === undefined ? again : Math.min(known, again);
  await storage.put(POOL_NEXT_AT_KEY, at);
  await armEarliest(storage, at);
};

/** A pass completed: the next pass is the first in a row again. */
const completed = async (storage: DurableObjectStorage): Promise<void> => {
  await storage.delete(FAILURES_KEY);
};

/**
Runs a pass, which holds a lease and takes the pool's time: whatever asks for a pass while it runs
(a write, a retry, its own next decision) arms it again. The pass is counted first (`FAILURES_KEY`)
and the lease written, so both outlive a pass cut short, and the alarm is armed at the lease's end:
such a pass runs again then even when the runtime never runs the alarm again. After a pass that
completed, that wake reads the gate and nothing else. A pass that keeps being cut short (a store
too big for the CPU limit, where no `catch` runs) holds a longer lease each time, 5 minutes
doubling to four hours, and one that keeps failing looks again later and later
(`retryAfterFailure`): either loads the log a few times in its first hour and then every four
hours, never at every lease's end.
*/
export const takingPoolTime = async <T>(
  storage: DurableObjectStorage,
  { now, pass }: { readonly now: string; readonly pass: () => Promise<T> },
): Promise<T> => {
  const from = Date.parse(now);
  const attempt = ((await storage.get<number>(FAILURES_KEY)) ?? 0) + 1;
  await storage.put(FAILURES_KEY, attempt);
  const lease = from + backoff(LEASE_MS, attempt);
  await storage.put(POOL_LEASE_KEY, lease);
  await storage.put(POOL_NEXT_AT_KEY, null);
  await armEarliest(storage, lease);
  try {
    const result = await pass();
    await release(storage, lease);
    await completed(storage);
    return result;
  } catch (error) {
    await retryAfterFailure(storage, { attempt, now: from });
    await release(storage, lease);
    throw error;
  }
};

/**
When the pool is due (epoch ms): at once when no time is recorded (a store from before the key) or
a time taken was never given back and no lease says a pass holds it; else at its own time, or when
the lease of a pass cut short runs out, whichever is first.
*/
const dueAtOf = ({
  known,
  lease,
}: {
  readonly known: null | number | undefined;
  readonly lease: number | undefined;
}): number =>
  known === undefined || (known === null && lease === undefined)
    ? -Infinity
    : Math.min(known ?? Infinity, lease ?? Infinity);

/**
The pool's part of `alarm()`: a pass once it is due (see `dueAtOf`); before that its time is armed
again and nothing is read.
*/
export const poolAtAlarm = async (
  storage: DurableObjectStorage,
  { now, pass }: { readonly now: string; readonly pass: () => Promise<unknown> },
): Promise<void> => {
  const dueAt = dueAtOf({
    known: await storage.get<null | number>(POOL_NEXT_AT_KEY),
    lease: await storage.get<number>(POOL_LEASE_KEY),
  });
  if (dueAt <= Date.parse(now)) {
    await pass();
  } else {
    await armEarliest(storage, dueAt);
  }
};

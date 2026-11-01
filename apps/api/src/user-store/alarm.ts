import { BEDTIME_FROM_HOUR, formatInZone, NIGHT_UNTIL_HOUR, wallClockInstant } from "@pace/core";

// The store has one alarm for everything it waits on: the notification pool's next pass and its
// retries, the assistant's queue, automatic sleep. Each arms it through `armEarliest`, so none
// moves another's earlier time later; `alarm()` runs them all and each arms its next time again.

/** Moves the store's one alarm to `at` when that is earlier than the one set (or none is). */
export const armEarliest = async (storage: DurableObjectStorage, at: number): Promise<void> => {
  const existing = await storage.getAlarm();
  if (existing === null || at < existing) {
    await storage.setAlarm(at);
  }
};

/**
Runs each of the alarm's passes whatever became of the ones before it (a failed pass of the pool
holds back neither the assistant's queue nor sleep), then fails with the first failure, so the
runtime tries the alarm again.
*/
export const runEach = async (passes: readonly (() => Promise<unknown>)[]): Promise<void> => {
  const failures: unknown[] = [];
  for (const pass of passes) {
    try {
      await pass();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw failures[0] instanceof Error ? failures[0] : new Error(String(failures[0]));
  }
};

/** How often automatic sleep looks again while a sleep can start or end. */
const SLEEP_CHECK_MINUTES = 15;

/**
When automatic sleep should look again after `now`: in 15 minutes while the local time is in
the hours a sleep can start or end (21:00 to noon, the night's span from bedtime), else at the
next 21:00 local. The wall clock is read in the zone, so a DST change moves nothing.
*/
export const nextSleepCheckAt = (now: string, zone: string): number => {
  const hour = Number(formatInZone(now, zone, "H"));
  const isNight = hour >= BEDTIME_FROM_HOUR || hour < NIGHT_UNTIL_HOUR;
  if (isNight) {
    return Date.parse(now) + SLEEP_CHECK_MINUTES * 60_000;
  }
  const today = formatInZone(now, zone, "yyyy-MM-dd");
  return Date.parse(wallClockInstant(today, `${String(BEDTIME_FROM_HOUR)}:00`, zone));
};

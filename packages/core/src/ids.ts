import { isValid, monotonicFactory } from "ulidx";

import { formatInZone } from "./time.ts";
import { NIGHT_UNTIL_HOUR } from "./tracking/phone-use.ts";

/** Random source in `[0, 1)`; injectable so tests can make ids deterministic. */
export type Prng = () => number;

export type IdFactory = (seedTime?: number) => string;

/**
The platform's `crypto.getRandomValues`, read at each id. Left to itself ulidx looks for it
when the factory is made, here on import, and throws without one: Hermes has none until the
Android app installs it, so the app closed at start.
*/
const platformPrng: Prng = () =>
  (globalThis.crypto.getRandomValues(new Uint8Array(1))[0] ?? 0) / 0xff;

/**
ULIDs sort by creation time and stay unique within one millisecond thanks to the
monotonic counter. One factory per process keeps the counter shared.
*/
export const createIdFactory = (prng: Prng = platformPrng): IdFactory => {
  const make = monotonicFactory(prng);
  // A time at or before the epoch is no time: ulidx would try to increment a counter it has
  // not made yet and throw, so the clock is used instead.
  return (seedTime?: number): string =>
    make(seedTime === undefined || seedTime <= 0 ? undefined : seedTime);
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
/** Minute precision in UTC (`20261007T2040`): the instant part of the sleep ids. */
const minuteStamp = (atIso: string): string => formatInZone(atIso, "UTC", "yyyyMMdd'T'HHmm");

/** The calendar day before `date` (`yyyy-MM-dd`), whatever the zone and its clock changes. */
const dayBefore = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);

/**
The night an instant belongs to, named by the date its evening falls on: the noon-to-noon span
in `zone`, so 00:30 and 11:59 on the 8th are both the night of the 7th.
*/
export const sleepNightOf = (atIso: string, zone: string): string => {
  const date = formatInZone(atIso, zone, "yyyy-MM-dd");
  return Number(formatInZone(atIso, zone, "H")) < NIGHT_UNTIL_HOUR ? dayBefore(date) : date;
};

/**
An automatic sleep's start, which is also its activity's id. The start instant is part of it,
not only the night: a short rest discarded in the evening frees the night for a later start,
which must not collide with the revoked one (class 38).
*/
export const sleepStartId = (night: string, atIso: string): string =>
  `auto:sleep-${night}:start-${minuteStamp(atIso)}`;

/** An automatic stop of a sleep (automatic or the person's) at an instant. */
export const sleepStopId = (activityId: string, atIso: string): string =>
  `auto:${activityId}:stop-${minuteStamp(atIso)}`;

/** The revocation of an automatic stop after a short wake: the sleep goes on. */
export const sleepReopenId = (stopEventId: string): string => `auto:${stopEventId}:reopen`;

/** The revocation of an automatic start whose sleep turned out too short. */
export const sleepDiscardId = (startEventId: string): string => `auto:${startEventId}:discard`;

const AUTO_SLEEP_START = /^auto:sleep-\d{4}-\d{2}-\d{2}:start-\d{8}T\d{4}$/u;
const AUTO_SLEEP_FOLLOW_UP = /^auto:\S+:(?:stop-\d{8}T\d{4}|reopen|discard)$/u;

/** Whether an event is one automatic sleep wrote (a start, a stop, a reopen or a discard). */
export const isAutoSleepId = (id: string): boolean =>
  AUTO_SLEEP_START.test(id) || AUTO_SLEEP_FOLLOW_UP.test(id);

import type { ActivityCategory } from "./model.ts";

import { sleepNightOf } from "../ids.ts";
import { addMinutesIso, minutesBetween } from "../time.ts";
import {
  awakeSpells,
  BACK_TO_SLEEP_MINUTES,
  type Interval,
  isWakeUp,
  laterOf,
  SLEEP_MIN_MINUTES,
} from "./phone-use.ts";

// How automatic sleep follows one sleep through the spells awake after its start (sleep-auto.ts
// decides which sleeps, and opens new ones).

/** A stretch someone used one of their devices: a phone's use interval, a computer's session. */
export type DeviceUse = {
  readonly deviceId: string;
  readonly startAt: string;
  readonly endAt: string;
};

/**
An activity as automatic sleep reads it: the effective state (revoked events already gone),
with the events that started and stopped it, whether automatic sleep wrote them, and the
instants of automatic stops the person undid (they said they were still asleep).
*/
export type SleepActivity = {
  readonly id: string;
  readonly category: ActivityCategory;
  readonly startAt: string;
  readonly endAt: null | string;
  readonly startEventId: string;
  /**
  Where its start event put the start, before any `activity.adjusted`: the instant of the
  `activity.started` (a logged block's own `startAt`). The materializer drops a stop before it.
  */
  readonly startEventAt: string;
  readonly stopEventId: null | string;
  readonly isAutoStart: boolean;
  readonly isAutoStop: boolean;
  readonly personRevokedStopsAt: readonly string[];
  /** Ids of this activity's automatic stops no longer in force (whoever revoked them). */
  readonly revokedAutoStopIds: readonly string[];
  /**
  The person moved its start (`activity.adjusted` with a `startAt`): an automatic sleep then
  reads as theirs, never discarded, its start never second-guessed.
  */
  readonly isStartAmendedByPerson: boolean;
  /**
  The person set its end (`activity.adjusted` with an `endAt`): that end is theirs, like a stop
  they made, so the rules never walk, move, reopen or discard the sleep.
  */
  readonly isEndAmendedByPerson: boolean;
};

export type SleepDecision =
  | { readonly kind: "discard"; readonly activityId: string; readonly startEventId: string }
  | { readonly kind: "open"; readonly at: string; readonly night: string }
  | { readonly kind: "reopen"; readonly activityId: string; readonly stopEventId: string }
  | { readonly kind: "stop"; readonly activityId: string; readonly at: string };

/** A Rest-class activity the person keeps (a running one has no end yet). */
export type Rest = { readonly startAt: string; readonly endAt: null | string };

export type Known = {
  readonly knownUntil: string;
  readonly usesFrom: string;
  readonly uses: readonly Interval[];
  readonly zone: string;
  /** The person's Rest-class activities that have started by `now`. */
  readonly rests: readonly Rest[];
};

/** A spell awake and the rest after it: until the next spell, or as far as use is known. */
type RestedSpell = Interval & { readonly restEnd: string; readonly isLast: boolean };

/** Where a walk through a sleep's spells ended it, and whether more quiet could still undo that. */
type SleepEnd = { readonly at: string; readonly isFinal: boolean };

type Walk = {
  /** Minutes of the short wakes inside the sleep. */
  readonly awake: number;
  readonly end: null | SleepEnd;
  /** A short wake inside the sleep covers its automatic stop: the stop goes. */
  readonly isReopening: boolean;
};

/** The earlier of two instants (ISO strings compare in time order; `Math.min` reads them as NaN). */
const earlierOf = (a: string, b: string): string => (a.localeCompare(b) < 0 ? a : b);

/**
Uses between `usesFrom` and `knownUntil`, by start: later ones are not known yet, one still
going ends there.
*/
export const knownUses = (
  uses: readonly DeviceUse[],
  { knownUntil, usesFrom }: { readonly knownUntil: string; readonly usesFrom: string },
): readonly Interval[] =>
  uses
    .filter((use) => use.startAt < knownUntil && use.endAt > usesFrom && use.startAt < use.endAt)
    .map((use) => ({
      endAt: earlierOf(use.endAt, knownUntil),
      startAt: use.startAt,
    }))
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt));

export const rested = (uses: readonly Interval[], knownUntil: string): readonly RestedSpell[] => {
  const spells = awakeSpells(uses);
  return spells.map((spell, index) => ({
    ...spell,
    isLast: index === spells.length - 1,
    restEnd: spells[index + 1]?.startAt ?? knownUntil,
  }));
};

/** A start automatic sleep chose and nobody moved: the rules may stop it short and discard it. */
export const isRulesStart = (sleep: SleepActivity): boolean =>
  sleep.isAutoStart && !sleep.isStartAmendedByPerson;

/**
The uses that happened inside a sleep. An automatic start claims quiet from that instant, so any
use after it counts, even one a late upload shows already running then. A person's start is
their word: the spell they started it from (pressing Sleep in Pace, the home screen after) is
them going to bed, and only use after that spell counts (class 39). A start they moved earlier
keeps the use before where it was first recorded theirs too: they put the start over it.
*/
const usesInside = (sleep: SleepActivity, uses: readonly Interval[]): readonly Interval[] => {
  const start = sleep.startAt;
  if (isRulesStart(sleep)) {
    return uses
      .filter((use) => use.endAt > start)
      .map((use) => ({ endAt: use.endAt, startAt: laterOf(use.startAt, start) }));
  }
  const spells = awakeSpells(uses);
  const bedEnd = (instant: string): string =>
    spells.find((spell) => spell.startAt <= instant && instant <= spell.endAt)?.endAt ?? instant;
  const after = laterOf(bedEnd(start), bedEnd(sleep.startEventAt));
  return uses.filter((use) => use.startAt > after);
};

const isWithin = (spell: Interval, instant: string): boolean =>
  spell.startAt <= instant && instant <= spell.endAt;

/** A wake-up inside this sleep: short, in its small hours, with the long rest after it known. */
const isWakeInside = (spell: RestedSpell, sleep: SleepActivity, zone: string): boolean =>
  isWakeUp(spell, { endAt: spell.restEnd, startAt: spell.endAt }, zone) &&
  sleepNightOf(spell.startAt, zone) === sleepNightOf(sleep.startAt, zone);

/** The last spell known could still turn out a wake-up once enough quiet after it is known. */
const canStillBeWake = (spell: RestedSpell, sleep: SleepActivity, zone: string): boolean =>
  spell.isLast &&
  isWakeInside(
    { ...spell, restEnd: addMinutesIso(spell.endAt, BACK_TO_SLEEP_MINUTES) },
    sleep,
    zone,
  );

const hasAutoStopIn = (sleep: SleepActivity, spell: Interval): boolean =>
  sleep.isAutoStop && sleep.endAt !== null && isWithin(spell, sleep.endAt);

/**
Where a rest the person logged ends an automatic sleep: at the start of the first one that runs
after the sleep's start (at the sleep's start for one already running then), the same whether
it was logged before the sleep opened or after. A person's own sleep is theirs to end.
*/
const restLimitOf = (sleep: SleepActivity, known: Known): readonly string[] =>
  isRulesStart(sleep)
    ? known.rests
        .filter((rest) => rest.endAt === null || rest.endAt > sleep.startAt)
        .map((rest) => laterOf(rest.startAt, sleep.startAt))
    : [];

/**
Another activity's start closed a sleep started live: an end with no stop event that the person
did not set either (the materializer closes the running main activity at every main start).
*/
export const isClosedByStart = (
  sleep: SleepActivity,
): sleep is SleepActivity & { readonly endAt: string } =>
  sleep.endAt !== null && sleep.stopEventId === null && !sleep.isEndAmendedByPerson;

/**
The first instant the sleep cannot run past: a rest of the person's, or where another activity's
start closed it (which no walk moves).
*/
const limitOf = (sleep: SleepActivity, known: Known): null | string =>
  [...restLimitOf(sleep, known), ...(isClosedByStart(sleep) ? [sleep.endAt] : [])]
    .toSorted((a, b) => a.localeCompare(b))
    .at(0) ?? null;

/**
Walks the spells awake after a sleep's start: one at an automatic stop the person undid stays
inside (they said they were asleep, so its minutes are not taken off), so does a wake-up; the
first other spell ends the sleep at its start, unless a rest of the person's or a closure ends
it first.
*/
const walk = (sleep: SleepActivity, known: Known): Walk => {
  const spells = rested(usesInside(sleep, known.uses), known.knownUntil);
  const limit = limitOf(sleep, known);
  const from = (index: number, awake: number, isReopening: boolean): Walk => {
    const spell = spells[index];
    if (limit !== null && (spell === undefined || limit < spell.startAt)) {
      return { awake, end: { at: limit, isFinal: true }, isReopening };
    }
    if (spell === undefined) {
      return { awake, end: null, isReopening };
    }
    if (sleep.personRevokedStopsAt.some((instant) => isWithin(spell, instant))) {
      return from(index + 1, awake, isReopening);
    }
    if (isWakeInside(spell, sleep, known.zone)) {
      const minutes = minutesBetween(spell.startAt, spell.endAt);
      return from(index + 1, awake + minutes, isReopening || hasAutoStopIn(sleep, spell));
    }
    const isFinal = !canStillBeWake(spell, sleep, known.zone);
    return { awake, end: { at: spell.startAt, isFinal }, isReopening };
  };
  return from(0, 0, false);
};

/** A sleep's decisions, and how it reads once they are applied (`null`: discarded). */
type Outcome = {
  readonly decisions: readonly SleepDecision[];
  readonly after: null | SleepActivity;
};

/**
Keeps one automatic stop in force, at the end the walk found. With no end (the sleep goes on),
a stop a short wake covers is revoked (reopen); an end elsewhere revokes the stop that is there
and stops at the end, so a stop moved earlier by a late upload leaves no second one behind.
*/
const reopenAndStop = (sleep: SleepActivity, walked: Walk): readonly SleepDecision[] => {
  const { end, isReopening } = walked;
  const autoStop = sleep.isAutoStop ? sleep.stopEventId : null;
  const reopen: readonly SleepDecision[] =
    autoStop === null ? [] : [{ activityId: sleep.id, kind: "reopen", stopEventId: autoStop }];
  if (end === null) {
    return isReopening ? reopen : [];
  }
  return sleep.endAt === end.at
    ? []
    : [...reopen, { activityId: sleep.id, at: end.at, kind: "stop" }];
};

/**
An automatic start whose end is decided, with less than a sleep's minutes asleep in between; or
one a late upload shows in use at its very start, which was never the start of a rest.
*/
const isTooShort = (sleep: SleepActivity, { awake, end }: Walk): boolean =>
  isRulesStart(sleep) &&
  end !== null &&
  (end.at === sleep.startAt ||
    (end.isFinal && minutesBetween(sleep.startAt, end.at) - awake < SLEEP_MIN_MINUTES));

/** Where the sleep ends once the decisions apply: at the new stop, open again, or as it was. */
const endAfter = (sleep: SleepActivity, { end, isReopening }: Walk): null | string => {
  if (end !== null) {
    return end.at;
  }
  return isReopening ? null : sleep.endAt;
};

/** Where a sleep ends once this pass's decisions about it apply (`null`: it runs on). */
export const endOnceWalked = (sleep: SleepActivity, known: Known): null | string =>
  endAfter(sleep, walk(sleep, known));

/**
A running or automatically stopped sleep, walked again with what is known now: reopened after
a short wake, stopped at the use that ended it, and when it was started automatically and
came out shorter than a sleep, discarded. A person's stop and a person's start are never moved.
*/
export const decideFor = (sleep: SleepActivity, known: Known): Outcome => {
  const walked = walk(sleep, known);
  const decisions = reopenAndStop(sleep, walked);
  if (isTooShort(sleep, walked)) {
    const discard: SleepDecision = {
      activityId: sleep.id,
      kind: "discard",
      startEventId: sleep.startEventId,
    };
    return { after: null, decisions: [...decisions, discard] };
  }
  return { after: { ...sleep, endAt: endAfter(sleep, walked) }, decisions };
};

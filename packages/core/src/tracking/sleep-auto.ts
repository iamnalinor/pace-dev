import type { EventInput } from "../events/event-schema.ts";
import type { ActivityCategory } from "./model.ts";

import { sleepDiscardId, sleepNightOf, sleepReopenId, sleepStartId, sleepStopId } from "../ids.ts";
import { addMinutesIso, minutesBetween } from "../time.ts";
import { isRestClass } from "./categories.ts";
import {
  awakeSpells,
  BACK_TO_SLEEP_MINUTES,
  bedtimeFloor,
  type Interval,
  isBedtime,
  isWakeUp,
  laterOf,
  REST_MIN_MINUTES,
  SLEEP_MIN_MINUTES,
} from "./phone-use.ts";

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
  readonly stopEventId: null | string;
  readonly isAutoStart: boolean;
  readonly isAutoStop: boolean;
  readonly personRevokedStopsAt: readonly string[];
};

/** Use on every device, how far the phones' use is known (`null`: nothing is), the activities. */
export type SleepInput = {
  readonly uses: readonly DeviceUse[];
  readonly knownUntil: null | string;
  readonly activities: readonly SleepActivity[];
  readonly now: string;
  readonly zone: string;
};

export type SleepDecision =
  | { readonly kind: "discard"; readonly activityId: string; readonly startEventId: string }
  | { readonly kind: "open"; readonly at: string; readonly night: string }
  | { readonly kind: "reopen"; readonly activityId: string; readonly stopEventId: string }
  | { readonly kind: "stop"; readonly activityId: string; readonly at: string };

type Known = {
  readonly knownUntil: string;
  readonly uses: readonly Interval[];
  readonly zone: string;
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

/** Uses up to `knownUntil`, by start: later ones are not known yet, one still going ends there. */
const knownUses = (uses: readonly DeviceUse[], knownUntil: string): readonly Interval[] =>
  uses
    .filter((use) => use.startAt < knownUntil && use.startAt < use.endAt)
    .map((use) => ({
      endAt: use.endAt < knownUntil ? use.endAt : knownUntil,
      startAt: use.startAt,
    }))
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt));

const rested = (uses: readonly Interval[], knownUntil: string): readonly RestedSpell[] => {
  const spells = awakeSpells(uses);
  return spells.map((spell, index) => ({
    ...spell,
    isLast: index === spells.length - 1,
    restEnd: spells[index + 1]?.startAt ?? knownUntil,
  }));
};

/**
The uses that happened inside a sleep. An automatic start claims quiet from that instant, so any
use after it counts, even one a late upload shows already running then. A person's start is
their word: the spell they started it from (pressing Sleep in Pace, the home screen after) is
them going to bed, and only use after that spell counts (class 39).
*/
const usesInside = (sleep: SleepActivity, uses: readonly Interval[]): readonly Interval[] => {
  const start = sleep.startAt;
  if (sleep.isAutoStart) {
    return uses
      .filter((use) => use.endAt > start)
      .map((use) => ({ endAt: use.endAt, startAt: laterOf(use.startAt, start) }));
  }
  const bed = awakeSpells(uses).find((spell) => spell.startAt <= start && start <= spell.endAt);
  const after = bed?.endAt ?? start;
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
Walks the spells awake after a sleep's start: one at an automatic stop the person undid stays
inside (they said they were asleep, so its minutes are not taken off), so does a wake-up; the
first other spell ends the sleep at its start.
*/
const walk = (sleep: SleepActivity, known: Known): Walk => {
  const spells = rested(usesInside(sleep, known.uses), known.knownUntil);
  const from = (index: number, awake: number, isReopening: boolean): Walk => {
    const spell = spells[index];
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

/** Its automatic stop revoked after a short wake, and a stop where use ended it if none is there. */
const reopenAndStop = (sleep: SleepActivity, walked: Walk): readonly SleepDecision[] => {
  const { end, isReopening } = walked;
  const reopen: readonly SleepDecision[] =
    isReopening && sleep.stopEventId !== null
      ? [{ activityId: sleep.id, kind: "reopen", stopEventId: sleep.stopEventId }]
      : [];
  if (end === null) {
    return reopen;
  }
  const isStopped = sleep.stopEventId !== null && sleep.endAt === end.at;
  const stop: readonly SleepDecision[] = isStopped
    ? []
    : [{ activityId: sleep.id, at: end.at, kind: "stop" }];
  return [...reopen, ...stop];
};

/** An automatic start whose end is decided, with less than a sleep's minutes asleep in between. */
const isTooShort = (sleep: SleepActivity, { awake, end }: Walk): boolean =>
  sleep.isAutoStart &&
  end?.isFinal === true &&
  minutesBetween(sleep.startAt, end.at) - awake < SLEEP_MIN_MINUTES;

/** Where the sleep ends once the decisions apply: at the new stop, open again, or as it was. */
const endAfter = (sleep: SleepActivity, { end, isReopening }: Walk): null | string => {
  if (end !== null) {
    return end.at;
  }
  return isReopening ? null : sleep.endAt;
};

/**
A running or automatically stopped sleep, walked again with what is known now: reopened after
a short wake, stopped at the use that ended it, and when it was started automatically and
came out shorter than a sleep, discarded. A person's stop and a person's start are never moved.
*/
const decideFor = (sleep: SleepActivity, known: Known): Outcome => {
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

const isWalked = (activity: SleepActivity): boolean =>
  activity.category === "sleep" && (activity.endAt === null || activity.isAutoStop);

const isRunningAt = (activity: SleepActivity, now: string): boolean =>
  activity.startAt <= now && (activity.endAt === null || activity.endAt > now);

type Opening = {
  readonly decisions: readonly SleepDecision[];
  readonly nights: ReadonlySet<string>;
  readonly isBlocked: boolean;
};

/** A sleep automatic sleep would open at `at`, before anything is decided about it. */
const newSleep = (at: string, night: string): SleepActivity => {
  const id = sleepStartId(night, at);
  return {
    category: "sleep",
    endAt: null,
    id,
    isAutoStart: true,
    isAutoStop: false,
    personRevokedStopsAt: [],
    startAt: at,
    startEventId: id,
    stopEventId: null,
  };
};

/**
Opens a sleep at the start of each long enough rest in bedtime, one a night: none in a night
that has a sleep, none while a Rest-class activity runs. A rest whose sleep would be discarded
as soon as it opened is passed over, so an upload that arrives late opens the real night at
once; told as it happens, the same rest opens, then is stopped and discarded.
*/
const opens = (activities: readonly SleepActivity[], known: Known, now: string) => {
  const { zone } = known;
  const initial: Opening = {
    decisions: [],
    isBlocked: activities.some(
      (activity) => isRestClass(activity.category) && isRunningAt(activity, now),
    ),
    nights: new Set(
      activities
        .filter((activity) => activity.category === "sleep")
        .map((activity) => sleepNightOf(activity.startAt, zone)),
    ),
  };
  const candidates = rested(known.uses, known.knownUntil)
    .map((spell) => ({ at: bedtimeFloor(spell.endAt, zone), restEnd: spell.restEnd }))
    .filter(
      ({ at, restEnd }) =>
        isBedtime(at, zone) && at < restEnd && minutesBetween(at, restEnd) >= REST_MIN_MINUTES,
    );
  // eslint-disable-next-line unicorn/no-array-reduce -- an opening takes its night from the rests after it
  return candidates.reduce<Opening>((opening, { at }) => {
    const night = sleepNightOf(at, zone);
    if (opening.isBlocked || opening.nights.has(night)) {
      return opening;
    }
    const { after, decisions } = decideFor(newSleep(at, night), known);
    return after === null
      ? opening
      : {
          decisions: [...opening.decisions, { at, kind: "open", night }, ...decisions],
          isBlocked: isRunningAt(after, now),
          nights: new Set([...opening.nights, night]),
        };
  }, initial).decisions;
};

/**
What automatic sleep does with what is known: reopen, stop or discard the sleeps it follows,
then open new ones. Nothing is decided without the phones' use (`knownUntil` null), and nothing
from use after `knownUntil`: quiet is only counted as far as it is known.
*/
export const decideSleep = (input: SleepInput): readonly SleepDecision[] => {
  if (input.knownUntil === null) {
    return [];
  }
  const known: Known = {
    knownUntil: input.knownUntil,
    uses: knownUses(input.uses, input.knownUntil),
    zone: input.zone,
  };
  const followed = input.activities
    .filter((activity) => isWalked(activity))
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt))
    .map((sleep) => ({ outcome: decideFor(sleep, known), sleep }));
  const decided = new Map(followed.map(({ outcome, sleep }) => [sleep.id, outcome.after]));
  // The activities as the decisions leave them: a discarded sleep frees its night.
  const after = input.activities.flatMap((activity) => {
    const outcome = decided.has(activity.id) ? decided.get(activity.id) : activity;
    return outcome === null || outcome === undefined ? [] : [outcome];
  });
  return [
    ...followed.flatMap(({ outcome }) => outcome.decisions),
    ...opens(after, known, input.now),
  ];
};

const revoke = (id: string, targetId: string, now: string): EventInput => ({
  id,
  occurredAt: now,
  payload: { targetId },
  precision: "exact",
  source: "system",
  type: "event.revoked",
});

const toEvent = (decision: SleepDecision, now: string): EventInput => {
  switch (decision.kind) {
    case "open": {
      const id = sleepStartId(decision.night, decision.at);
      return {
        id,
        occurredAt: decision.at,
        payload: { activityId: id, category: "sleep", label: "Sleep" },
        precision: "approx",
        source: "system",
        type: "activity.started",
      };
    }
    case "stop": {
      return {
        id: sleepStopId(decision.activityId, decision.at),
        occurredAt: decision.at,
        payload: { activityId: decision.activityId },
        precision: "approx",
        source: "system",
        type: "activity.stopped",
      };
    }
    case "reopen": {
      return revoke(sleepReopenId(decision.stopEventId), decision.stopEventId, now);
    }
    case "discard": {
      return revoke(sleepDiscardId(decision.startEventId), decision.startEventId, now);
    }
  }
};

/**
The events the decisions write, through the system path: the start (labelled "Sleep"; the
screen words it), stops at the instant use ended the sleep, and revocations for a reopen (of
the stop) and a discard (of the start). Ids follow from the night, the instant and the event
followed up, so deciding again on the same input names the same events.
*/
export const sleepEvents = (
  decisions: readonly SleepDecision[],
  input: SleepInput,
): readonly EventInput[] => decisions.map((decision) => toEvent(decision, input.now));

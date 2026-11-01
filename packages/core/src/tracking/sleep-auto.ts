import type { EventInput } from "../events/event-schema.ts";

import { sleepDiscardId, sleepNightOf, sleepReopenId, sleepStartId, sleepStopId } from "../ids.ts";
import { minutesBetween } from "../time.ts";
import { isRestClass } from "./categories.ts";
import { bedtimeFloor, type Interval, isBedtime, REST_MIN_MINUTES } from "./phone-use.ts";
import {
  decideFor,
  type DeviceUse,
  type Known,
  knownUses,
  rested,
  type SleepActivity,
  type SleepDecision,
} from "./sleep-walk.ts";

export type { DeviceUse, SleepActivity, SleepDecision } from "./sleep-walk.ts";

/** Use on every device, how far the phones' use is known (`null`: nothing is), the activities. */
export type SleepInput = {
  readonly uses: readonly DeviceUse[];
  readonly knownUntil: null | string;
  readonly activities: readonly SleepActivity[];
  readonly now: string;
  readonly zone: string;
  /** Where `uses` start: nothing before it is known, so nothing before it is decided. */
  readonly usesFrom: string;
  /** Ids of the automatic starts no longer in force (discarded, or deleted by the person). */
  readonly revokedAutoStartIds: readonly string[];
  /** Automatic starts the person deleted: their nights get no automatic sleep again. */
  readonly personRevokedAutoStarts: readonly {
    readonly startEventId: string;
    readonly night: string;
  }[];
};

/** A sleep the rules follow: running or stopped by them, and started inside the known uses. */
const isWalked = (activity: SleepActivity, usesFrom: string): boolean =>
  activity.category === "sleep" &&
  activity.startAt >= usesFrom &&
  (activity.endAt === null || activity.isAutoStop);

const isRunningAt = (activity: SleepActivity, now: string): boolean =>
  activity.startAt <= now && (activity.endAt === null || activity.endAt > now);

type Opening = {
  readonly decisions: readonly SleepDecision[];
  readonly nights: ReadonlySet<string>;
  readonly isBlocked: boolean;
};

/** A sleep automatic sleep would open at `at`, before anything is decided about it. */
const newSleep = (at: string, night: string, used: readonly string[]): SleepActivity => {
  const id = sleepStartId(night, at, used);
  return {
    category: "sleep",
    endAt: null,
    id,
    isAutoStart: true,
    isAutoStop: false,
    isStartAmendedByPerson: false,
    personRevokedStopsAt: [],
    revokedAutoStopIds: [],
    startAt: at,
    startEventId: id,
    stopEventId: null,
  };
};

/** The latest end of the recorded rests overlapping [at, until), or `at`: a sleep starts after them. */
const pastRests = (at: string, until: string, rests: readonly Interval[]): string =>
  rests
    .filter((rest) => rest.startAt < until && rest.endAt > at)
    .map((rest) => rest.endAt)
    .toSorted((a, b) => a.localeCompare(b))
    .at(-1) ?? at;

const isOverRest = (from: string, to: string, rests: readonly Interval[]): boolean =>
  rests.some((rest) => rest.startAt < to && rest.endAt > from);

/** Where each rest long enough in bedtime would start a sleep: after any Rest the person recorded. */
const candidatesIn = (known: Known, rests: readonly Interval[]): readonly string[] => {
  const { zone } = known;
  return rested(known.uses, known.knownUntil)
    .map((spell) => ({
      at: pastRests(bedtimeFloor(spell.endAt, zone), spell.restEnd, rests),
      restEnd: spell.restEnd,
    }))
    .filter(
      ({ at, restEnd }) =>
        isBedtime(at, zone) && at < restEnd && minutesBetween(at, restEnd) >= REST_MIN_MINUTES,
    )
    .map(({ at }) => at);
};

/**
Opens a sleep at the start of each long enough rest in bedtime, one a night: none in a night
that has a sleep or whose automatic sleep the person deleted, none while a Rest-class activity
runs, none over one the person recorded. A rest whose sleep would be discarded as soon as it
opened is passed over, so an upload that arrives late opens the real night at once; told as it
happens, the same rest opens, then is stopped and discarded.
*/
const opens = (activities: readonly SleepActivity[], known: Known, input: SleepInput) => {
  const { now, personRevokedAutoStarts } = input;
  const rests = activities.filter((activity) => isRestClass(activity.category));
  // A running one blocks every opening; the ended ones bound where a sleep may lie.
  const ended = rests
    .filter((rest): rest is SleepActivity & { readonly endAt: string } => rest.endAt !== null)
    .map(({ endAt, startAt }) => ({ endAt, startAt }));
  const initial: Opening = {
    decisions: [],
    isBlocked: rests.some((rest) => isRunningAt(rest, now)),
    nights: new Set([
      ...rests
        .filter((rest) => rest.category === "sleep")
        .map((sleep) => sleepNightOf(sleep.startAt, known.zone)),
      ...personRevokedAutoStarts.map((start) => start.night),
    ]),
  };
  // eslint-disable-next-line unicorn/no-array-reduce -- an opening takes its night from the rests after it
  return candidatesIn(known, ended).reduce<Opening>((opening, at) => {
    const night = sleepNightOf(at, known.zone);
    if (opening.isBlocked || opening.nights.has(night)) {
      return opening;
    }
    const { after, decisions } = decideFor(newSleep(at, night, input.revokedAutoStartIds), known);
    return after === null || isOverRest(at, after.endAt ?? known.knownUntil, ended)
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
  const bounds = { knownUntil: input.knownUntil, usesFrom: input.usesFrom };
  const known: Known = { ...bounds, uses: knownUses(input.uses, bounds), zone: input.zone };
  const followed = input.activities
    .filter((activity) => isWalked(activity, input.usesFrom))
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt))
    .map((sleep) => ({ outcome: decideFor(sleep, known), sleep }));
  const decided = new Map(followed.map(({ outcome, sleep }) => [sleep.id, outcome.after]));
  // The activities as the decisions leave them: a discarded sleep frees its night.
  const after = input.activities.flatMap((activity) => {
    const outcome = decided.has(activity.id) ? decided.get(activity.id) : activity;
    return outcome === null || outcome === undefined ? [] : [outcome];
  });
  return [...followed.flatMap(({ outcome }) => outcome.decisions), ...opens(after, known, input)];
};

const revoke = (id: string, targetId: string, now: string): EventInput => ({
  id,
  occurredAt: now,
  payload: { targetId },
  precision: "exact",
  source: "system",
  type: "event.revoked",
});

/** The stop ids an activity already has, in force or revoked: a new stop must not reuse one. */
const stopIdsOf = (input: SleepInput, activityId: string): readonly string[] => {
  const activity = input.activities.find((each) => each.id === activityId);
  return activity === undefined
    ? []
    : [
        ...(activity.stopEventId === null ? [] : [activity.stopEventId]),
        ...activity.revokedAutoStopIds,
      ];
};

const toEvent = (decision: SleepDecision, input: SleepInput): EventInput => {
  const { now } = input;
  switch (decision.kind) {
    case "open": {
      const id = sleepStartId(decision.night, decision.at, input.revokedAutoStartIds);
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
        id: sleepStopId(decision.activityId, decision.at, stopIdsOf(input, decision.activityId)),
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
): readonly EventInput[] => decisions.map((decision) => toEvent(decision, input));

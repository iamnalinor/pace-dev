import type { EventInput } from "../events/event-schema.ts";

import { sleepDiscardId, sleepNightOf, sleepReopenId, sleepStartId, sleepStopId } from "../ids.ts";
import { minutesBetween } from "../time.ts";
import { isRestClass } from "./categories.ts";
import { bedtimeFloor, isBedtime, REST_MIN_MINUTES } from "./phone-use.ts";
import {
  decideFor,
  type DeviceUse,
  isRulesStart,
  type Known,
  knownUses,
  type Rest,
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

/**
A sleep the rules own outright: they started it, nobody moved its start or undid one of its
stops, and it is walked. It is kept only while deciding afresh would open the same one.
*/
const isOwned = (activity: SleepActivity, usesFrom: string): boolean =>
  isWalked(activity, usesFrom) &&
  isRulesStart(activity) &&
  activity.personRevokedStopsAt.length === 0;

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

/**
Where a sleep may start in [at, until) once the person's ended rests there are over: after the
latest of their ends, or `at`. One still running ends the sleep where it began instead (the
walk stops a sleep at a rest), so such a start is discarded before it opens.
*/
const pastRests = (at: string, until: string, rests: readonly Rest[]): string =>
  rests
    .filter(
      (rest): rest is Rest & { readonly endAt: string } =>
        rest.endAt !== null && rest.startAt < until && rest.endAt > at,
    )
    .map((rest) => rest.endAt)
    .toSorted((a, b) => a.localeCompare(b))
    .at(-1) ?? at;

/** Where each rest long enough in bedtime would start a sleep: after any Rest the person recorded. */
const candidatesIn = (known: Known): readonly string[] => {
  const { rests, zone } = known;
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
The sleeps deciding afresh would open, one a night: at the first rest long enough in bedtime,
none in a night already taken (by a sleep the rules do not own, or one whose automatic sleep
the person deleted). A rest whose sleep would be discarded as soon as it opened is passed over.
*/
const freshSleeps = (known: Known, taken: ReadonlySet<string>): readonly SleepActivity[] => {
  // eslint-disable-next-line unicorn/no-array-reduce -- a sleep takes its night from the rests after it
  const chosen = candidatesIn(known).reduce<{
    readonly nights: ReadonlySet<string>;
    readonly sleeps: readonly SleepActivity[];
  }>(
    (picked, at) => {
      const night = sleepNightOf(at, known.zone);
      const sleep = newSleep(at, night, []);
      return picked.nights.has(night) || decideFor(sleep, known).after === null
        ? picked
        : { nights: new Set([...picked.nights, night]), sleeps: [...picked.sleeps, sleep] };
    },
    { nights: taken, sleeps: [] },
  );
  return chosen.sleeps;
};

/**
The Rest-class activities that bound automatic sleep: the person's (every one but the sleeps the
rules started and still own), from before `knownUntil`.
*/
const restsOf = (activities: readonly SleepActivity[], knownUntil: string): readonly Rest[] =>
  activities
    .filter(
      (activity) =>
        isRestClass(activity.category) && !isRulesStart(activity) && activity.startAt < knownUntil,
    )
    .map(({ endAt, startAt }) => ({ endAt, startAt }));

/**
The automatic start ids a new start must not take: those no longer in force, and those this
pass discards (a start in the same minute would otherwise share the discarded one's id).
*/
const startIdsUsed = (
  input: SleepInput,
  decisions: readonly SleepDecision[],
): readonly string[] => [
  ...input.revokedAutoStartIds,
  ...decisions
    .filter((decision) => decision.kind === "discard")
    .map((decision) => decision.startEventId),
];

const discardOf = (sleep: SleepActivity): SleepDecision => ({
  activityId: sleep.id,
  kind: "discard",
  startEventId: sleep.startEventId,
});

/**
A sleep the rules own, walked again; when deciding afresh would not open it (late data shows an
earlier rest, or none at all), it goes too, so where the sleeps end does not depend on the
order the data came in.
*/
const reconcile = (sleep: SleepActivity, known: Known, fresh: readonly SleepActivity[]) => {
  const { after, decisions } = decideFor(sleep, known);
  const isKept = fresh.some((each) => each.startAt === sleep.startAt);
  return isKept || after === null ? decisions : [...decisions, discardOf(sleep)];
};

/**
What automatic sleep does with what is known: walks the sleeps it follows (reopen, stop,
discard), keeps those it owns only while deciding afresh would open the same ones, and opens
the rest. Nothing is decided without the phones' use (`knownUntil` null), nothing from use
after `knownUntil`, nothing before `usesFrom`.
*/
export const decideSleep = (input: SleepInput): readonly SleepDecision[] => {
  if (input.knownUntil === null) {
    return [];
  }
  const { knownUntil, usesFrom } = input;
  const known: Known = {
    knownUntil,
    rests: restsOf(input.activities, knownUntil),
    usesFrom,
    uses: knownUses(input.uses, { knownUntil, usesFrom }),
    zone: input.zone,
  };
  const owned = input.activities.filter((activity) => isOwned(activity, usesFrom));
  const others = input.activities.filter((activity) => !isOwned(activity, usesFrom));
  const taken = new Set([
    ...others
      .filter((activity) => activity.category === "sleep")
      .map((sleep) => sleepNightOf(sleep.startAt, known.zone)),
    ...input.personRevokedAutoStarts.map((start) => start.night),
  ]);
  const fresh = freshSleeps(known, taken);
  const followed = [
    ...others
      .filter((activity) => isWalked(activity, usesFrom))
      .map((sleep) => ({ decisions: decideFor(sleep, known).decisions, sleep })),
    ...owned.map((sleep) => ({ decisions: reconcile(sleep, known, fresh), sleep })),
  ]
    .toSorted((a, b) => a.sleep.startAt.localeCompare(b.sleep.startAt))
    .flatMap(({ decisions }) => decisions);
  const used = startIdsUsed(input, followed);
  const opened = fresh
    .filter((sleep) => owned.every((each) => each.startAt !== sleep.startAt))
    .flatMap((sleep): readonly SleepDecision[] => {
      const night = sleepNightOf(sleep.startAt, known.zone);
      const { decisions } = decideFor(newSleep(sleep.startAt, night, used), known);
      return [{ at: sleep.startAt, kind: "open", night }, ...decisions];
    });
  return [...followed, ...opened];
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

const toEvent = (
  decision: SleepDecision,
  { input, usedStartIds }: { readonly input: SleepInput; readonly usedStartIds: readonly string[] },
): EventInput => {
  const { now } = input;
  switch (decision.kind) {
    case "open": {
      const id = sleepStartId(decision.night, decision.at, usedStartIds);
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
): readonly EventInput[] => {
  const usedStartIds = startIdsUsed(input, decisions);
  return decisions.map((decision) => toEvent(decision, { input, usedStartIds }));
};

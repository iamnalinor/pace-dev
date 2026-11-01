import { compareEvents } from "../events/sort.ts";
import { sleepNightOf, sleepStartId } from "../ids.ts";
import { minutesBetween } from "../time.ts";
import { isRestClass } from "./categories.ts";
import { bedtimeFloor, type Interval, isBedtime, laterOf, REST_MIN_MINUTES } from "./phone-use.ts";
import {
  decideFor,
  type DeviceUse,
  endOnceWalked,
  isClosedByStart,
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
  /**
  The latest `knownUntil` an earlier pass decided with (Task 13 keeps it with the decisions);
  `null` before the first. Less known now never undoes what was written then.
  */
  readonly decidedUntil: null | string;
  /** Where `uses` start: nothing before it is known, so nothing before it is decided. */
  readonly usesFrom: string;
  /** Ids of the automatic starts no longer in force (discarded, or deleted by the person). */
  readonly revokedAutoStartIds: readonly string[];
  /** Automatic starts the person deleted: their nights get no automatic sleep again. */
  readonly personRevokedAutoStarts: readonly {
    readonly startEventId: string;
    readonly night: string;
  }[];
  /**
  The instants the person recorded (an activity's start or stop, a logged block's bounds, a bound
  they moved; any category, from any device): they were awake then, as at a use of no length.
  Known once in the log, whatever the phones have told.
  */
  readonly personMarks: readonly string[];
  /**
  Every live main start in force but the rules' own (the person's, and those the server recorded
  for them, like Attend answered in the feed), by the canonical order: each closes the main
  activity running when the materializer applies it.
  */
  readonly mainStarts: readonly MainStart[];
};

/** A live main start: where it is, and its event's id, which orders it against others there. */
export type MainStart = { readonly at: string; readonly id: string };

/** An end the person made: a stop of theirs, or an end they set (whatever stop sits there). */
const hasPersonsEnd = (activity: SleepActivity): boolean =>
  activity.isEndAmendedByPerson || (activity.stopEventId !== null && !activity.isAutoStop);

/**
A sleep that is the rules' own record: they started it as a sleep, and the person neither moved
its start, nor named it something else, nor made its end. Every other activity is the person's.
*/
const isRulesSleep = (activity: SleepActivity): boolean =>
  isRulesStart(activity) && activity.category === "sleep" && !hasPersonsEnd(activity);

/**
A sleep the rules follow, started inside the known uses: running, stopped by them, or (one of
their own) closed by another activity's start, whose end stays but which is still discarded
when short like any automatic sleep. An end the person made is never followed.
*/
export const isWalked = (activity: SleepActivity, usesFrom: string): boolean =>
  activity.category === "sleep" &&
  activity.startAt >= usesFrom &&
  !activity.isEndAmendedByPerson &&
  (activity.endAt === null ||
    activity.isAutoStop ||
    (isRulesSleep(activity) && isClosedByStart(activity)));

/**
A sleep the rules own outright: their own record (nobody moved its start, renamed it or made
its end), none of its stops undone, and walked, with the use (or recorded instant) its start was
found after still among the known ones. It is kept only while deciding afresh would open the
same one; once the window's front has passed that use, deciding afresh cannot see where the night
started, so the sleep is walked as it stands (its night stays taken) and never reconciled away.
*/
const isOwned = (activity: SleepActivity, known: Known): boolean =>
  isWalked(activity, known.usesFrom) &&
  isRulesSleep(activity) &&
  activity.personRevokedStopsAt.length === 0 &&
  known.uses.some((use) => use.endAt <= activity.startAt);

/**
A sleep automatic sleep would open at `at`, as the log will hold it before anything is decided
about it: closed at the first main start the materializer applies after its own start. At the
same instant that is by id (`compareEvents`): a person's ULID start applies first, so the night
opened at it runs on (the C1 fix relies on this); a start whose id sorts after `auto:` (the schema
admits `hw:` and `rep:`) closes the sleep where it opened, which is then never opened.
*/
const newSleep = (
  at: string,
  {
    mainStarts,
    night,
    used,
  }: { mainStarts: readonly MainStart[]; night: string; used: readonly string[] },
): SleepActivity => {
  const id = sleepStartId(night, at, used);
  const own = { id, occurredAt: at };
  return {
    category: "sleep",
    endAt:
      mainStarts.find((start) => compareEvents({ id: start.id, occurredAt: start.at }, own) > 0)
        ?.at ?? null,
    id,
    isAutoStart: true,
    isAutoStop: false,
    isEndAmendedByPerson: false,
    isStartAmendedByPerson: false,
    personRevokedStopsAt: [],
    revokedAutoStopIds: [],
    startAt: at,
    startEventAt: at,
    startEventId: id,
    stopEventId: null,
  };
};

/**
Where a sleep may start in [at, until) once the person's ended rests there are over: after the
latest of their ends, or `at`. One still running ends the sleep where it began instead (the
walk stops a sleep at a rest), so such a start is discarded before it opens.
*/
export const pastRests = (at: string, until: string, rests: readonly Rest[]): string =>
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
const freshSleeps = (
  known: Known,
  { mainStarts, taken }: { mainStarts: readonly MainStart[]; taken: ReadonlySet<string> },
): readonly SleepActivity[] => {
  // eslint-disable-next-line unicorn/no-array-reduce -- a sleep takes its night from the rests after it
  const chosen = candidatesIn(known).reduce<{
    readonly nights: ReadonlySet<string>;
    readonly sleeps: readonly SleepActivity[];
  }>(
    (picked, at) => {
      const night = sleepNightOf(at, known.zone);
      const sleep = newSleep(at, { mainStarts, night, used: [] });
      return picked.nights.has(night) || decideFor(sleep, known).after === null
        ? picked
        : { nights: new Set([...picked.nights, night]), sleeps: [...picked.sleeps, sleep] };
    },
    { nights: taken, sleeps: [] },
  );
  return chosen.sleeps;
};

/**
The Rest-class activities that bound automatic sleep: the person's (every one but the rules' own
sleeps), from the instant they start, known by `now` whatever the phones have told.
*/
const restsOf = (activities: readonly SleepActivity[], now: string): readonly Rest[] =>
  activities
    .filter(
      (activity) =>
        isRestClass(activity.category) && !isRulesSleep(activity) && activity.startAt <= now,
    )
    .map(({ endAt, startAt }) => ({ endAt, startAt }));

/**
The activities with the person's sleeps as this pass's walk leaves them (a sleep of theirs it
stops is no longer a rest running on). Their walk reads no rests: only automatic starts end at one.
*/
const asWalked = (input: SleepInput, unbounded: Known): readonly SleepActivity[] =>
  input.activities.map((activity) =>
    isWalked(activity, input.usesFrom) && !isRulesStart(activity)
      ? { ...activity, endAt: endOnceWalked(activity, unbounded) }
      : activity,
  );

/**
The automatic start ids a new start must not take: those no longer in force, and those this
pass discards (a start in the same minute would otherwise share the discarded one's id). One in
force is never at stake: its night is taken, or it is the sleep the open would be.
*/
export const startIdsUsed = (
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
const reconcile = (
  sleep: SleepActivity,
  known: Known,
  {
    fresh,
    personNights,
  }: { readonly fresh: readonly SleepActivity[]; readonly personNights: ReadonlySet<string> },
) => {
  const { after, decisions } = decideFor(sleep, known);
  // A sleep of the person's in the same night restrains opening, not the sleep already there.
  const isKept =
    personNights.has(sleepNightOf(sleep.startAt, known.zone)) ||
    fresh.some((each) => each.startAt === sleep.startAt);
  return isKept || after === null ? decisions : [...decisions, discardOf(sleep)];
};

/**
The known uses with the person's recorded instants among them, each a use of no length: those from
`usesFrom` up to `now`, past `knownUntil` too (the walk counts no quiet after `knownUntil`).
*/
const withMarks = (
  uses: readonly Interval[],
  { now, personMarks, usesFrom }: SleepInput,
): readonly Interval[] =>
  [
    ...uses,
    ...personMarks
      .filter((mark) => mark > usesFrom && mark <= now)
      .map((mark) => ({ endAt: mark, startAt: mark })),
  ].toSorted((a, b) => a.startAt.localeCompare(b.startAt));

/**
What the walks read: use known up to `knownUntil` (less known than an earlier pass decided with
undoes nothing, so the larger of the two) with the person's recorded instants, and their rests.
*/
const knownOf = (input: SleepInput, knownUntil: string): Known => {
  const { usesFrom } = input;
  const decidedOn = laterOf(knownUntil, input.decidedUntil ?? knownUntil);
  const unbounded: Known = {
    endsBy: null,
    knownUntil: decidedOn,
    rests: [],
    usesFrom,
    uses: withMarks(knownUses(input.uses, { knownUntil: decidedOn, usesFrom }), input),
    zone: input.zone,
  };
  return { ...unbounded, rests: restsOf(asWalked(input, unbounded), input.now) };
};

/** What a pass decides on: what is known, the sleeps the rules own and the others, the fresh ones. */
export type SleepPlan = {
  readonly known: Known;
  readonly owned: readonly SleepActivity[];
  readonly others: readonly SleepActivity[];
  readonly personNights: ReadonlySet<string>;
  readonly fresh: readonly SleepActivity[];
};

export const planOf = (input: SleepInput, knownUntil: string): SleepPlan => {
  const known = knownOf(input, knownUntil);
  const owned = input.activities.filter((activity) => isOwned(activity, known));
  const others = input.activities.filter((activity) => !isOwned(activity, known));
  const personNights = new Set(
    others
      .filter((activity) => activity.category === "sleep")
      .map((sleep) => sleepNightOf(sleep.startAt, known.zone)),
  );
  // Nights settled: the person's sleeps, and those automatic sleep opened that are no longer the
  // rules' alone (the person deleted, renamed, moved or ended them) in the night they opened in.
  const taken = new Set([
    ...personNights,
    ...input.personRevokedAutoStarts.map((start) => start.night),
    ...others
      .filter((activity) => activity.isAutoStart)
      .map((activity) => sleepNightOf(activity.startEventAt, known.zone)),
  ]);
  const fresh = freshSleeps(known, { mainStarts: input.mainStarts, taken });
  return { fresh, known, others, owned, personNights };
};

/**
Once no phone has told anything for a day (`knownUntil` null), a running sleep of the rules' own
ends where knowledge ended (`decidedUntil`), the last instant its quiet was known, and goes when
that leaves it short; whatever the 36 hours of use still reach. A sleep of the person's is theirs.
A phone that tells again later walks it as usual: a later first use moves the stop there.
*/
const endedWhereKnown = (input: SleepInput, lastKnown: string): readonly SleepDecision[] => {
  const known: Known = { ...knownOf(input, lastKnown), endsBy: lastKnown };
  return input.activities
    .filter((activity) => isRulesSleep(activity) && activity.endAt === null)
    .flatMap((sleep) => decideFor(sleep, known).decisions);
};

/**
What automatic sleep does with what is known: walks the sleeps it follows (reopen, stop,
discard), keeps those it owns only while deciding afresh would open the same ones, and opens
the rest. Nothing is decided without the phones' use (`knownUntil` null), nothing from use
after `knownUntil`, nothing before `usesFrom`; once the phones have told nothing for a day, the
rules' running sleeps end where knowledge ended (`endedWhereKnown`).
*/
export const decideSleep = (input: SleepInput): readonly SleepDecision[] => {
  if (input.knownUntil === null) {
    return input.decidedUntil === null ? [] : endedWhereKnown(input, input.decidedUntil);
  }
  const { fresh, known, others, owned, personNights } = planOf(input, input.knownUntil);
  const { mainStarts, usesFrom } = input;
  const followed = [
    ...others
      .filter((activity) => isWalked(activity, usesFrom))
      .map((sleep) => ({ decisions: decideFor(sleep, known).decisions, sleep })),
    ...owned.map((sleep) => ({
      decisions: reconcile(sleep, known, { fresh, personNights }),
      sleep,
    })),
  ]
    .toSorted((a, b) => a.sleep.startAt.localeCompare(b.sleep.startAt))
    .flatMap(({ decisions }) => decisions);
  const used = startIdsUsed(input, followed);
  const opened = fresh
    .filter((sleep) => owned.every((each) => each.startAt !== sleep.startAt))
    .flatMap((sleep): readonly SleepDecision[] => {
      const night = sleepNightOf(sleep.startAt, known.zone);
      const { decisions } = decideFor(newSleep(sleep.startAt, { mainStarts, night, used }), known);
      return [{ at: sleep.startAt, kind: "open", night }, ...decisions];
    });
  return [...followed, ...opened];
};

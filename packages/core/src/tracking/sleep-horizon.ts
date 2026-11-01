import { addMinutesIso } from "../time.ts";
import {
  BACK_TO_SLEEP_MINUTES,
  bedtimeFloor,
  type Interval,
  isWakeUp,
  REST_MIN_MINUTES,
} from "./phone-use.ts";
import { isWalked, pastRests, planOf, type SleepInput } from "./sleep-auto.ts";
import { isDecided, rested } from "./sleep-walk.ts";

// When a pass of automatic sleep can be skipped: the store loads the whole log for each pass, so
// it decides again only when what it would decide on can have changed.

export type SleepHorizon = {
  /**
  The first `knownUntil` (as decided on: never below `decidedUntil`) at which knowing more could
  change a decision, with the same uses and the same log; `null` when none could.
  */
  readonly quietUntil: null | string;
  /**
  Every sleep the rules follow, and every one they would open, is decided for good (or goes as
  too short): new use after what is known now cannot change any of them.
  */
  readonly isSettled: boolean;
};

/** A spell that turns out a wake-up once the quiet after it is long enough (short, small hours). */
const canBeWake = (spell: Interval, zone: string): boolean =>
  isWakeUp(
    spell,
    { endAt: addMinutesIso(spell.endAt, BACK_TO_SLEEP_MINUTES), startAt: spell.endAt },
    zone,
  );

/**
How far a pass's decisions hold. With the uses and the log unchanged, they change only where more
knowledge crosses an instant they compare with: a use or a recorded instant becoming known, a
rest of the person's starting or ending, and for the rest still open after the last spell, its
candidate start, 45 minutes after it, and, when the spell may be a wake-up, 90 minutes after it.
*/
export const sleepHorizon = (input: SleepInput): SleepHorizon => {
  if (input.knownUntil === null) {
    return { isSettled: true, quietUntil: null };
  }
  const plan = planOf(input, input.knownUntil);
  const { known } = plan;
  const decidedOn = known.knownUntil;
  const open = rested(known.uses, decidedOn).findLast((spell) => spell.startAt <= decidedOn);
  const at =
    open === undefined
      ? null
      : pastRests(bedtimeFloor(open.endAt, known.zone), decidedOn, known.rests);
  const crossings = [
    ...input.uses.flatMap((use) => [use.startAt, use.endAt]),
    ...input.personMarks,
    ...known.rests.map((rest) => rest.startAt),
    ...known.rests.map((rest) => rest.endAt).filter((end): end is string => end !== null),
    ...(open === undefined ? [] : [open.endAt]),
    ...(open === undefined || !canBeWake(open, known.zone)
      ? []
      : [addMinutesIso(open.endAt, BACK_TO_SLEEP_MINUTES)]),
    ...(at === null ? [] : [at, addMinutesIso(at, REST_MIN_MINUTES)]),
  ];
  const followed = [...plan.others, ...plan.owned].filter((sleep) =>
    isWalked(sleep, input.usesFrom),
  );
  return {
    isSettled: [...followed, ...plan.fresh].every((sleep) => isDecided(sleep, known)),
    quietUntil:
      crossings
        .filter((instant) => instant >= decidedOn)
        .toSorted((a, b) => a.localeCompare(b))
        .at(0) ?? null,
  };
};

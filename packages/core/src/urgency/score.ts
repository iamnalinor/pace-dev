import type { UrgencyInput, UrgencyPolicy } from "./input.ts";
import type { PolicyTrace } from "./trace.ts";

import { endOfDayIn } from "../time.ts";
import { addDays, earliest, evaluationClock, isAfter } from "./clock.ts";
import { MULTIPLIERS, PRIORITIZED_HORIZON_DAYS, RANK_BONUS } from "./constants.ts";
import { tracePolicy } from "./policies.ts";

export type Score = {
  /** `multiplier × urgency + rankBonus`; 0 while the task is hidden. */
  readonly score: number;
  readonly urgency: number;
  readonly multiplier: number;
  readonly rankBonus: number;
  readonly policy: UrgencyPolicy;
  /** The explicit due date combined with the importance's implicit horizon. */
  readonly effectiveDue: null | string;
  /** A task whose start is still ahead stays out of Now. */
  readonly hidden: boolean;
  /** `waitingSince` when the evaluation clock is frozen. */
  readonly frozenAt: null | string;
};

/** Everything a score (or its explanation) is built from, computed once. */
export type Evaluation = {
  /** The instant the policies were evaluated at (frozen while waiting). */
  readonly at: string;
  readonly effectiveDue: null | string;
  readonly policy: PolicyTrace;
  /** The pace evaluation of the implicit horizon, when the importance implies one. */
  readonly implicit: null | PolicyTrace;
  readonly urgency: number;
};

/**
 * Soft horizon implied by the importance: ASAP wants the task done by the end of the day
 * (in the account zone), Prioritized within three days of being prioritized.
 */
const implicitHorizon = (input: UrgencyInput, at: string): null | string => {
  switch (input.importance) {
    case "asap": {
      return endOfDayIn(at, input.accountTz);
    }
    case "prioritized": {
      return addDays(input.importanceSetAt ?? input.createdAt, PRIORITIZED_HORIZON_DAYS);
    }
    case "normal":
    case "nice_to_have": {
      return null;
    }
  }
};

export const effectiveDue = (input: UrgencyInput, now: string): null | string =>
  earliest(input.dueAt, implicitHorizon(input, evaluationClock(input, now)));

/** The implicit horizon is paced like a homework deadline and can only raise the urgency. */
export const evaluate = (input: UrgencyInput, now: string): Evaluation => {
  const at = evaluationClock(input, now);
  const policy = tracePolicy(input, at);
  const horizon = implicitHorizon(input, at);
  const due = earliest(input.dueAt, horizon);
  const implicit = horizon === null ? null : tracePolicy({ ...input, dueAt: due }, at, "pace");
  return {
    at,
    effectiveDue: due,
    policy,
    implicit,
    urgency: implicit === null ? policy.u : Math.max(policy.u, implicit.u),
  };
};

/** Manual order inside a category: the top entry gets the full bonus, the last none. */
const rankBonus = (rank: UrgencyInput["rank"]): number =>
  rank === null || rank.size === 0
    ? 0
    : (RANK_BONUS * Math.max(0, rank.size - rank.position)) / rank.size;

export const toScore = (input: UrgencyInput, now: string, evaluation: Evaluation): Score => {
  const isHidden = input.startAt !== null && isAfter(input.startAt, now);
  const multiplier = MULTIPLIERS[input.importance];
  const bonus = rankBonus(input.rank);
  return {
    score: isHidden ? 0 : multiplier * evaluation.urgency + bonus,
    urgency: evaluation.urgency,
    multiplier,
    rankBonus: bonus,
    policy: input.policy,
    effectiveDue: evaluation.effectiveDue,
    hidden: isHidden,
    frozenAt: input.waitingSince,
  };
};

export const scoreTask = (input: UrgencyInput, now: string): Score =>
  toScore(input, now, evaluate(input, now));

export type TieBreak = {
  readonly dueAt: null | string;
  readonly createdAt: string;
};

/** A scored task with what breaks ties on the Now list. */
export type Ranked = {
  readonly score: Score;
  readonly tieBreak: TieBreak;
};

const compareInstants = (a: string, b: string): number => Date.parse(a) - Date.parse(b);

/** Earlier due first; tasks without a due date go after those with one. */
const compareDue = (a: null | string, b: null | string): number => {
  if (a === null) {
    return b === null ? 0 : 1;
  }
  return b === null ? -1 : compareInstants(a, b);
};

/** Now-list order: score descending, then due ascending, then creation ascending. */
export const compareScores = (a: Ranked, b: Ranked): number => {
  if (a.score.score !== b.score.score) {
    return b.score.score - a.score.score;
  }
  const byDue = compareDue(a.tieBreak.dueAt, b.tieBreak.dueAt);
  return byDue === 0 ? compareInstants(a.tieBreak.createdAt, b.tieBreak.createdAt) : byDue;
};

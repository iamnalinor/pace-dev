import type { DeadlinePolicy, UrgencyPolicy } from "../model/preset.ts";
import type { UrgencyInput, WorkLeft } from "./input.ts";

import { addDays, daysBetween, evaluationClock, hoursBetween, isAfter } from "./clock.ts";
import {
  AGE_SAT,
  AGE_TAU_DAYS,
  LAG_GAIN,
  PACE_MIN_HOURS,
  RESUBMISSION_GROWTH_PER_DAY,
  U_FLOOR,
  U_MAX,
} from "./constants.ts";
import { percent, type PolicyTrace } from "./trace.ts";

/** Every policy sits on the shared floor and is capped, so presets compete on one scale. */
const bounded = (raw: number): number => Math.min(U_MAX, U_FLOOR + Math.max(0, raw));

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const wholeTask = (input: UrgencyInput): WorkLeft => ({
  progress: input.progress,
  estimateHours: input.estimateHours,
});

/** Past the due date only the unsubmitted part of the task still counts. */
const workAt = (input: UrgencyInput, at: string, due: string): WorkLeft =>
  isAfter(at, due) ? input.remaining : wholeTask(input);

const traceAge = (input: UrgencyInput, at: string): PolicyTrace => {
  const ageDays = Math.max(0, daysBetween(input.createdAt, at));
  const u = bounded(AGE_SAT * (1 - Math.exp(-ageDays / AGE_TAU_DAYS)));
  return {
    formula: `${U_FLOOR} + ${AGE_SAT} · (1 − e^(−d / ${AGE_TAU_DAYS}))`,
    inputs: [{ key: "ageDays", value: ageDays, unit: "days" }],
    steps: [{ key: "urgency", value: u }],
    u,
  };
};

/** A deadline to pace against and the part of the task that still counts towards it. */
type Aim = {
  readonly target: string;
  readonly work: WorkLeft;
};

/** Required pace: work left per hour left until the target. */
const paceTowards = (input: UrgencyInput, at: string, { target, work }: Aim): PolicyTrace => {
  const hoursLeft = hoursBetween(at, target);
  const workLeft = (1 - work.progress) * work.estimateHours * input.calibration;
  const u = bounded(workLeft / Math.max(hoursLeft, PACE_MIN_HOURS));
  return {
    formula: `${U_FLOOR} + (1 − p) · E / max(h, ${PACE_MIN_HOURS})`,
    inputs: [
      { key: "progress", value: percent(work.progress), unit: "percent" },
      { key: "workLeft", value: workLeft, unit: "hours" },
      { key: "hoursLeft", value: hoursLeft, unit: "hours" },
    ],
    steps: [{ key: "urgency", value: u }],
    u,
  };
};

const tracePace = (input: UrgencyInput, at: string): PolicyTrace =>
  input.dueAt === null
    ? traceAge(input, at)
    : paceTowards(input, at, { target: input.dueAt, work: workAt(input, at, input.dueAt) });

const traceLag = (input: UrgencyInput, at: string): PolicyTrace => {
  if (input.dueAt === null) {
    return traceAge(input, at);
  }
  const start = input.startAt ?? input.createdAt;
  const window = hoursBetween(start, input.dueAt);
  // A window that has no length is treated as fully elapsed.
  const elapsed = window <= 0 ? 1 : clamp01(hoursBetween(start, at) / window);
  const behind = elapsed - input.progress;
  const u = bounded(LAG_GAIN * behind);
  return {
    formula: `${U_FLOOR} + ${LAG_GAIN} · max(0, r − p)`,
    inputs: [
      { key: "windowElapsed", value: percent(elapsed), unit: "percent" },
      { key: "progress", value: percent(input.progress), unit: "percent" },
    ],
    steps: [
      { key: "behindPace", value: behind },
      { key: "urgency", value: u },
    ],
    u,
  };
};

/** A hard deadline is a resubmission window of zero days with no final deadline. */
const softWindow = (
  deadline: DeadlinePolicy,
): { readonly softDays: number; readonly finalAt: null | string } =>
  deadline.kind === "resubmission" ? deadline : { softDays: 0, finalAt: null };

const finalPassed = (finalAt: string): PolicyTrace => ({
  formula: String(U_MAX),
  inputs: [{ key: "finalAt", value: finalAt }],
  steps: [{ key: "finalPassed", value: 1 }],
  u: U_MAX,
});

const afterSoftTarget = (input: UrgencyInput, at: string, soft: string): PolicyTrace => {
  const atSoft = paceTowards(input, soft, { target: soft, work: input.remaining });
  const daysAfter = daysBetween(soft, at);
  const u = Math.min(U_MAX, atSoft.u + RESUBMISSION_GROWTH_PER_DAY * daysAfter);
  return {
    formula: `u(soft) + ${RESUBMISSION_GROWTH_PER_DAY} · d`,
    inputs: [
      { key: "softTarget", value: soft },
      { key: "daysAfterSoftTarget", value: daysAfter, unit: "days" },
      ...atSoft.inputs.filter((row) => row.key !== "hoursLeft"),
    ],
    steps: [
      { key: "urgencyAtSoftTarget", value: atSoft.u },
      { key: "urgency", value: u },
    ],
    u,
  };
};

/**
Piecewise per spec: pace until `due`, then pace against `due + softDays` over the
unsubmitted work, then linear growth until `finalAt`, after which the outcomes module
closes the task (the urgency saturates meanwhile).
*/
const traceResubmission = (input: UrgencyInput, at: string): PolicyTrace => {
  if (input.dueAt === null) {
    return traceAge(input, at);
  }
  const { finalAt, softDays } = softWindow(input.deadline);
  if (finalAt !== null && isAfter(at, finalAt)) {
    return finalPassed(finalAt);
  }
  if (!isAfter(at, input.dueAt)) {
    return paceTowards(input, at, { target: input.dueAt, work: wholeTask(input) });
  }
  const soft = addDays(input.dueAt, softDays);
  if (!isAfter(at, soft)) {
    const trace = paceTowards(input, at, { target: soft, work: input.remaining });
    return { ...trace, inputs: [{ key: "softTarget", value: soft }, ...trace.inputs] };
  }
  return afterSoftTarget(input, at, soft);
};

const TRACERS: Record<UrgencyPolicy, (input: UrgencyInput, at: string) => PolicyTrace> = {
  age: traceAge,
  lag: traceLag,
  pace: tracePace,
  resubmission: traceResubmission,
};

/** The task's own policy, evaluated on the (possibly frozen) clock, with its working. */
export const tracePolicy = (
  input: UrgencyInput,
  now: string,
  policy: UrgencyPolicy = input.policy,
): PolicyTrace => TRACERS[policy](input, evaluationClock(input, now));

export const pace = (input: UrgencyInput, now: string): number => tracePolicy(input, now, "pace").u;

export const lag = (input: UrgencyInput, now: string): number => tracePolicy(input, now, "lag").u;

export const age = (input: UrgencyInput, now: string): number => tracePolicy(input, now, "age").u;

export const resubmission = (input: UrgencyInput, now: string): number =>
  tracePolicy(input, now, "resubmission").u;

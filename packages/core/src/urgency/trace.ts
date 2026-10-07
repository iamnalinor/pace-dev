/**
Structured explanation rows. The keys are translated by the UI (`explain.<key>`); core
never produces prose.
*/
export type ExplainKey =
  | "ageDays"
  | "behindPace"
  | "daysAfterSoftTarget"
  | "finalAt"
  | "finalPassed"
  | "hoursLeft"
  | "implicitDue"
  | "implicitUrgency"
  | "multiplier"
  | "progress"
  | "rank"
  | "rankBonus"
  | "rankSize"
  | "score"
  | "softTarget"
  | "urgency"
  | "urgencyAtSoftTarget"
  | "waitingSince"
  | "windowElapsed"
  | "workLeft";

export type ExplainUnit = "days" | "hours" | "percent" | "x";

/** Something that went into the formula. */
export type ExplainInput = {
  readonly key: ExplainKey;
  readonly value: null | number | string;
  readonly unit?: ExplainUnit;
};

/** An intermediate or final number the formula produced. */
export type ExplainStep = {
  readonly key: ExplainKey;
  readonly value: number;
};

/** A policy's urgency together with how it was computed. */
export type PolicyTrace = {
  readonly formula: string;
  readonly inputs: readonly ExplainInput[];
  readonly steps: readonly ExplainStep[];
  readonly u: number;
};

export const percent = (fraction: number): number => fraction * 100;

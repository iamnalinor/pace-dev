import type { DeadlinePolicy, Importance, UrgencyPolicy } from "../model/preset.ts";

/**
 * What the urgency module needs to know about a task. The queries layer maps a task plus
 * its resolved preset to this shape; the importance, policy and deadline types are the
 * preset model's own, so a `ResolvedPreset` feeds in without conversion.
 */

/** Progress (0..1) and estimate in hours over some part of the task. */
export type WorkLeft = {
  readonly progress: number;
  readonly estimateHours: number;
};

export type UrgencyInput = {
  readonly importance: Importance;
  /** When the importance was last set; drives the Prioritized horizon. */
  readonly importanceSetAt: null | string;
  readonly policy: UrgencyPolicy;
  readonly createdAt: string;
  /** A future start hides the task from Now. */
  readonly startAt: null | string;
  readonly dueAt: null | string;
  readonly deadline: DeadlinePolicy;
  /** Progress over the whole task, 0..1. */
  readonly progress: number;
  /**
   * Progress and estimate over the unsubmitted subtasks only, which the pace policy uses
   * after the due date. Before the due date they equal the whole-task values.
   */
  readonly remaining: WorkLeft;
  readonly estimateHours: number;
  /** Estimate calibration `c` (fact / estimate median); 1 until stage 3 measures it. */
  readonly calibration: number;
  /** Waiting freezes the evaluation clock here. */
  readonly waitingSince: null | string;
  /** Manual order inside the importance category, 1-based. */
  readonly rank: null | { readonly position: number; readonly size: number };
  /** IANA zone that "end of the day" is measured in. */
  readonly accountTz: string;
};

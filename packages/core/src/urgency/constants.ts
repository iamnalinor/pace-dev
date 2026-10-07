/**
Urgency constants. Rough but reasonable starting values per the spec; a preset may
override the policy parameters, and stage 3 calibrates estimates from tracked time.
*/

/** Importance multipliers: `score = multiplier × urgency + rank bonus`. */
export const MULTIPLIERS = {
  asap: 7,
  prioritized: 5,
  normal: 3,
  nice_to_have: 1,
} as const;

/** Every policy adds this floor, so no open task ever scores zero (hidden tasks aside). */
export const U_FLOOR = 0.25;

/** Upper bound of every policy's urgency, floor included: one scale for all presets. */
export const U_MAX = 3;

/**
How much the age policy can add on top of the floor. Chosen so an aged Nice-to-have
(at most 1 × (U_FLOOR + AGE_SAT) = 0.65) never beats a fresh Normal task (3 × U_FLOOR = 0.75).
*/
export const AGE_SAT = 0.4;

/** Time constant of the age curve: after this many days the age term reaches 1 − e⁻¹ of AGE_SAT. */
export const AGE_TAU_DAYS = 7;

/** Lag gain: a task one full window behind an even pace adds this much urgency. */
export const LAG_GAIN = 1.5;

/** The pace policy never divides by fewer hours than this, so an overdue task stays finite. */
export const PACE_MIN_HOURS = 0.5;

/** After the resubmission soft target, urgency grows by this much per day until the final deadline. */
export const RESUBMISSION_GROWTH_PER_DAY = 0.1;

/** Prioritized implies a soft horizon this many days after the importance was set. */
export const PRIORITIZED_HORIZON_DAYS = 3;

/** Largest manual-order bonus inside a category: `RANK_BONUS × (size − position) / size`. */
export const RANK_BONUS = 0.1;

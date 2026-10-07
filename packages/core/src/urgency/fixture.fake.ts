import type { UrgencyInput } from "./input.ts";

/**
The TRK-231 artboard timeline: started Monday 09:00, due Friday 18:00 (a 105 h window);
"now" is 65 % through the window with 40 % progress.
*/
export const TRK_START = "2026-10-05T09:00:00.000Z";
export const TRK_DUE = "2026-10-09T18:00:00.000Z";
export const TRK_NOW = "2026-10-08T05:15:00.000Z";

/** A plain Normal task with a lag policy and nothing else set; override what a test needs. */
export const task = (overrides: Partial<UrgencyInput> = {}): UrgencyInput => ({
  importance: "normal",
  importanceSetAt: null,
  policy: "lag",
  createdAt: TRK_START,
  startAt: null,
  dueAt: null,
  deadline: { kind: "hard" },
  progress: 0,
  remaining: { progress: 0, estimateHours: 1 },
  estimateHours: 1,
  calibration: 1,
  waitingSince: null,
  rank: null,
  accountTz: "UTC",
  ...overrides,
});

/** The work task from the "Why it's 2nd on Now" card. */
export const trk231 = (): UrgencyInput =>
  task({
    importance: "prioritized",
    // Late enough that the 3-day horizon lands after the explicit due date.
    importanceSetAt: "2026-10-07T12:00:00.000Z",
    policy: "lag",
    startAt: TRK_START,
    dueAt: TRK_DUE,
    progress: 0.4,
    remaining: { progress: 0.4, estimateHours: 8 },
    estimateHours: 8,
    rank: { position: 2, size: 3 },
  });

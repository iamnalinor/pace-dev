import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addMinutesIso } from "../time.ts";
import { AGE_SAT, PACE_MIN_HOURS, U_FLOOR, U_MAX } from "./constants.ts";
import { task, TRK_DUE, TRK_NOW, TRK_START } from "./fixture.fake.ts";
import { age, lag, pace, resubmission } from "./policies.ts";

const DAY = 24 * 60;
const addDays = (iso: string, days: number): string => addMinutesIso(iso, days * DAY);

describe("pace", () => {
  it("is work left over hours left, plus the floor", () => {
    // 6 h of work, 12 h left → 0.5 h of work per hour.
    const input = task({
      policy: "pace",
      dueAt: addMinutesIso(TRK_NOW, 12 * 60),
      estimateHours: 8,
    });
    const withProgress = { ...input, progress: 0.25 };
    expect(pace(withProgress, TRK_NOW)).toBeCloseTo(U_FLOOR + 0.5, 10);
  });

  it("scales the estimate by the calibration factor", () => {
    const input = task({
      policy: "pace",
      dueAt: addMinutesIso(TRK_NOW, 12 * 60),
      estimateHours: 8,
      calibration: 1.5,
    });
    expect(pace(input, TRK_NOW)).toBeCloseTo(U_FLOOR + 1, 10);
  });

  it("never divides by less than PACE_MIN_HOURS and caps at U_MAX", () => {
    const input = task({ policy: "pace", dueAt: addMinutesIso(TRK_NOW, 1), estimateHours: 1 });
    expect(pace(input, TRK_NOW)).toBeCloseTo(U_FLOOR + 1 / PACE_MIN_HOURS, 10);
    expect(pace({ ...input, estimateHours: 100 }, TRK_NOW)).toBe(U_MAX);
  });

  it("uses the unsubmitted remainder only after the due date", () => {
    const input = task({
      policy: "pace",
      dueAt: TRK_DUE,
      progress: 0.4,
      estimateHours: 8,
      remaining: { progress: 0.8, estimateHours: 2 },
    });
    const afterDue = addMinutesIso(TRK_DUE, 60);
    // 0.2 × 2 h over the 0.5 h minimum window = 0.8, not the whole task's 0.6 × 8 / 0.5.
    expect(pace(input, afterDue)).toBeCloseTo(U_FLOOR + 0.8, 10);
    expect(pace(input, TRK_NOW)).toBeCloseTo(U_FLOOR + (0.6 * 8) / 36.75, 10);
  });

  it("falls back to age without a due date", () => {
    const input = task({ policy: "pace", dueAt: null });
    expect(pace(input, TRK_NOW)).toBe(age(input, TRK_NOW));
  });

  it("is frozen at waitingSince", () => {
    const input = task({
      policy: "pace",
      dueAt: TRK_DUE,
      estimateHours: 8,
      waitingSince: TRK_START,
    });
    const frozen = pace(input, TRK_NOW);
    expect(frozen).toBe(pace(input, TRK_START));
    expect(frozen).toBe(pace(input, addDays(TRK_DUE, 10)));
    expect(frozen).toBeLessThan(pace({ ...input, waitingSince: null }, TRK_NOW));
  });
});

describe("lag", () => {
  it("adds 1.5 × how far progress trails the elapsed window (TRK-231)", () => {
    const input = task({ startAt: TRK_START, dueAt: TRK_DUE, progress: 0.4 });
    // 65 % of the window gone, 40 % done → 0.25 behind.
    expect(lag(input, TRK_NOW)).toBeCloseTo(0.625, 10);
  });

  it("stays at the floor when progress is ahead of the window", () => {
    const input = task({ startAt: TRK_START, dueAt: TRK_DUE, progress: 0.9 });
    expect(lag(input, TRK_NOW)).toBe(U_FLOOR);
  });

  it("starts the window at createdAt when startAt is missing", () => {
    const explicit = task({ startAt: TRK_START, dueAt: TRK_DUE, progress: 0.4 });
    const implicit = task({ createdAt: TRK_START, startAt: null, dueAt: TRK_DUE, progress: 0.4 });
    expect(lag(implicit, TRK_NOW)).toBe(lag(explicit, TRK_NOW));
  });

  it("clamps the elapsed ratio to [0, 1]", () => {
    const input = task({ startAt: TRK_START, dueAt: TRK_DUE, progress: 0 });
    expect(lag(input, addDays(TRK_DUE, 30))).toBeCloseTo(U_FLOOR + 1.5, 10);
    expect(lag(input, addDays(TRK_START, -30))).toBe(U_FLOOR);
  });

  it("treats a due date at or before the start as a fully elapsed window", () => {
    const input = task({ startAt: TRK_DUE, dueAt: TRK_DUE, progress: 0.5 });
    expect(lag(input, TRK_NOW)).toBeCloseTo(U_FLOOR + 0.75, 10);
  });

  it("falls back to age without a due date", () => {
    const input = task({ dueAt: null });
    expect(lag(input, TRK_NOW)).toBe(age(input, TRK_NOW));
  });
});

const createdArb = fc
  .integer({ max: Date.UTC(2028, 0, 1), min: Date.UTC(2024, 0, 1) })
  .map((ms) => new Date(ms).toISOString());
const ageMinutesArb = fc.integer({ max: 10 * 365 * DAY, min: 0 });

describe("age", () => {
  it("reaches 1 − e⁻¹ of the saturation after one time constant", () => {
    const input = task({ createdAt: TRK_START });
    expect(age(input, addDays(TRK_START, 7))).toBeCloseTo(
      U_FLOOR + AGE_SAT * (1 - Math.E ** -1),
      10,
    );
  });

  it("is the floor for a task created now or in the future", () => {
    const input = task({ createdAt: TRK_START });
    expect(age(input, TRK_START)).toBe(U_FLOOR);
    expect(age(input, addDays(TRK_START, -3))).toBe(U_FLOOR);
  });

  it("never exceeds U_FLOOR + AGE_SAT and grows with age", () => {
    fc.assert(
      fc.property(createdArb, ageMinutesArb, ageMinutesArb, (createdAt, a, b) => {
        const input = task({ createdAt });
        const [earlier, later] = a <= b ? [a, b] : [b, a];
        const uEarlier = age(input, addMinutesIso(createdAt, earlier));
        const uLater = age(input, addMinutesIso(createdAt, later));
        expect(uLater).toBeLessThanOrEqual(U_FLOOR + AGE_SAT);
        expect(uEarlier).toBeGreaterThanOrEqual(U_FLOOR);
        expect(uEarlier).toBeLessThanOrEqual(uLater);
      }),
    );
  });
});

const HALF_DONE = { progress: 0.5, estimateHours: 4 };

const resubmissionTask = (
  softDays: number,
  finalAt: null | string,
  work: { readonly progress: number; readonly estimateHours: number } = HALF_DONE,
) =>
  task({
    policy: "resubmission",
    dueAt: TRK_DUE,
    deadline: { kind: "resubmission", softDays, finalAt, finalTz: finalAt === null ? null : "UTC" },
    progress: work.progress,
    estimateHours: work.estimateHours,
    remaining: work,
  });

describe("resubmission", () => {
  it("behaves like pace before the due date", () => {
    const input = resubmissionTask(7, null);
    expect(resubmission(input, TRK_NOW)).toBe(pace(input, TRK_NOW));
  });

  it("paces against the soft target between due and due + softDays", () => {
    const input = resubmissionTask(7, null, { progress: 0.5, estimateHours: 4 });
    // 2 h of work, 48 h to the soft target.
    expect(resubmission(input, addDays(TRK_DUE, 5))).toBeCloseTo(U_FLOOR + 2 / 48, 10);
  });

  it("grows linearly per day after the soft target", () => {
    const input = resubmissionTask(7, null, { progress: 0.9, estimateHours: 4 });
    const atSoft = U_FLOOR + 0.4 / PACE_MIN_HOURS;
    expect(resubmission(input, addDays(TRK_DUE, 7))).toBeCloseTo(atSoft, 10);
    expect(resubmission(input, addDays(TRK_DUE, 9))).toBeCloseTo(atSoft + 0.2, 10);
  });

  it("returns U_MAX after the final deadline", () => {
    const finalAt = addDays(TRK_DUE, 20);
    const input = resubmissionTask(7, finalAt, { progress: 1, estimateHours: 1 });
    expect(resubmission(input, finalAt)).toBeLessThan(U_MAX);
    expect(resubmission(input, addMinutesIso(finalAt, 1))).toBe(U_MAX);
  });

  it("treats a hard deadline as a zero-day soft window", () => {
    const hard = task({
      policy: "resubmission",
      dueAt: TRK_DUE,
      deadline: { kind: "hard" },
      progress: 0.9,
      remaining: { progress: 0.9, estimateHours: 4 },
      estimateHours: 4,
    });
    const atDue = U_FLOOR + 0.4 / PACE_MIN_HOURS;
    expect(resubmission(hard, addDays(TRK_DUE, 1))).toBeCloseTo(atDue + 0.1, 10);
  });

  it("falls back to age without a due date", () => {
    const input = { ...resubmissionTask(7, null), dueAt: null };
    expect(resubmission(input, TRK_NOW)).toBe(age(input, TRK_NOW));
  });

  it("grows monotonically inside each piece and never exceeds U_MAX", () => {
    const softDaysArb = fc.integer({ max: 14, min: 1 });
    const workArb = fc.record({
      estimateHours: fc.double({ max: 40, min: 0, noNaN: true }),
      progress: fc.double({ max: 1, min: 0, noNaN: true }),
    });
    const unitArb = fc.double({ max: 1, min: 0, noNaN: true });
    const caseArb = fc.record({
      softDays: softDaysArb,
      work: workArb,
      piece: fc.constantFrom("before", "soft", "after"),
      x: unitArb,
      y: unitArb,
    });
    fc.assert(
      fc.property(caseArb, ({ piece, softDays, work, x, y }) => {
        const input = resubmissionTask(softDays, addDays(TRK_DUE, softDays + 30), work);
        const soft = addDays(TRK_DUE, softDays);
        const span: Record<string, readonly [string, number]> = {
          after: [soft, 30 * DAY],
          before: [addDays(TRK_DUE, -10), 10 * DAY],
          soft: [TRK_DUE, softDays * DAY],
        };
        const [from, minutes] = span[piece] ?? [TRK_DUE, 0];
        const [a, b] = x <= y ? [x, y] : [y, x];
        const uEarlier = resubmission(input, addMinutesIso(from, Math.ceil(a * minutes)));
        const uLater = resubmission(input, addMinutesIso(from, Math.ceil(b * minutes)));
        expect(uEarlier).toBeGreaterThanOrEqual(0);
        expect(uLater).toBeLessThanOrEqual(U_MAX);
        expect(uEarlier).toBeLessThanOrEqual(uLater + 1e-9);
      }),
    );
  });
});

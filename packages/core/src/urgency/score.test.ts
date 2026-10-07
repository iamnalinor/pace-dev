import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Importance, UrgencyInput } from "./input.ts";

import { addMinutesIso } from "../time.ts";
import { MULTIPLIERS, RANK_BONUS, U_FLOOR } from "./constants.ts";
import { task, trk231, TRK_DUE, TRK_NOW, TRK_START } from "./fixture.fake.ts";
import { age, lag, pace, resubmission } from "./policies.ts";
import { compareScores, effectiveDue, type Ranked, type Score, scoreTask } from "./score.ts";

const DAY = 24 * 60;
const addDays = (iso: string, days: number): string => addMinutesIso(iso, days * DAY);

describe("scoreTask", () => {
  it("reproduces the TRK-231 card: lag 0.625 × Prioritized 5 + rank 2 of 3", () => {
    const score = scoreTask(trk231(), TRK_NOW);
    expect(score.score).toBeCloseTo(3.158, 3);
    expect(score.urgency).toBeCloseTo(0.625, 10);
    expect(score.multiplier).toBe(5);
    expect(score.rankBonus).toBeCloseTo(RANK_BONUS / 3, 10);
    expect(score.policy).toBe("lag");
    expect(score.effectiveDue).toBe(TRK_DUE);
    expect(score.hidden).toBe(false);
    expect(score.frozenAt).toBeNull();
  });

  it("gives the rank bonus to the top of a category and nothing to the bottom", () => {
    const first = scoreTask(task({ rank: { position: 1, size: 3 } }), TRK_NOW);
    const last = scoreTask(task({ rank: { position: 3, size: 3 } }), TRK_NOW);
    const unranked = scoreTask(task({ rank: null }), TRK_NOW);
    expect(first.rankBonus).toBeCloseTo((RANK_BONUS * 2) / 3, 10);
    expect(last.rankBonus).toBe(0);
    expect(unranked.rankBonus).toBe(0);
    expect(first.score - unranked.score).toBeCloseTo((RANK_BONUS * 2) / 3, 10);
  });

  it("hides a task whose start is in the future (score 0)", () => {
    const future = scoreTask(task({ startAt: addDays(TRK_NOW, 1) }), TRK_NOW);
    const started = scoreTask(task({ startAt: addDays(TRK_NOW, -1) }), TRK_NOW);
    expect(future.hidden).toBe(true);
    expect(future.score).toBe(0);
    expect(started.hidden).toBe(false);
    expect(started.score).toBeGreaterThan(0);
  });

  it("freezes a waiting task at waitingSince", () => {
    const input = task({
      policy: "pace",
      dueAt: TRK_DUE,
      estimateHours: 8,
      waitingSince: TRK_START,
    });
    const frozen = scoreTask(input, TRK_NOW);
    expect(frozen.frozenAt).toBe(TRK_START);
    expect(frozen.score).toBe(scoreTask({ ...input, waitingSince: null }, TRK_START).score);
    expect(frozen.score).toBe(scoreTask(input, addDays(TRK_DUE, 5)).score);
  });
});

describe("effectiveDue", () => {
  const LATE_EVENING_UTC = "2026-10-06T19:30:00.000Z";

  it("gives an ASAP task the end of the current day in the account zone", () => {
    const moscow = task({ importance: "asap", accountTz: "Europe/Moscow" });
    const losAngeles = task({ importance: "asap", accountTz: "America/Los_Angeles" });
    expect(effectiveDue(moscow, LATE_EVENING_UTC)).toBe("2026-10-06T20:59:59.999Z");
    expect(effectiveDue(losAngeles, LATE_EVENING_UTC)).toBe("2026-10-07T06:59:59.999Z");
  });

  it("makes an ASAP task more urgent where the day ends sooner", () => {
    const base = task({ importance: "asap", estimateHours: 2 });
    const moscow = scoreTask({ ...base, accountTz: "Europe/Moscow" }, LATE_EVENING_UTC);
    const losAngeles = scoreTask({ ...base, accountTz: "America/Los_Angeles" }, LATE_EVENING_UTC);
    expect(moscow.urgency).toBeCloseTo(U_FLOOR + 2 / 1.5, 3);
    expect(losAngeles.urgency).toBeCloseTo(U_FLOOR + 2 / 11.5, 3);
    expect(moscow.effectiveDue).toBe("2026-10-06T20:59:59.999Z");
  });

  it("keeps an explicit due date that is earlier than the implicit horizon", () => {
    const soon = addMinutesIso(LATE_EVENING_UTC, 30);
    const input = task({ importance: "asap", dueAt: soon, accountTz: "Europe/Moscow" });
    expect(effectiveDue(input, LATE_EVENING_UTC)).toBe(soon);
  });

  it("gives a Prioritized task three days from when the importance was set", () => {
    const prioritizedAt = "2026-10-06T10:00:00.000Z";
    const input = task({ importance: "prioritized", importanceSetAt: prioritizedAt });
    expect(effectiveDue(input, TRK_NOW)).toBe("2026-10-09T10:00:00.000Z");
    expect(effectiveDue({ ...input, dueAt: addDays(prioritizedAt, 10) }, TRK_NOW)).toBe(
      "2026-10-09T10:00:00.000Z",
    );
    expect(effectiveDue({ ...input, dueAt: addDays(prioritizedAt, 1) }, TRK_NOW)).toBe(
      addDays(prioritizedAt, 1),
    );
  });

  it("counts the Prioritized horizon from creation when the set time is unknown", () => {
    const input = task({ importance: "prioritized", importanceSetAt: null, createdAt: TRK_START });
    expect(effectiveDue(input, TRK_NOW)).toBe(addDays(TRK_START, 3));
  });

  it("is the explicit due date (or nothing) for Normal and Nice-to-have", () => {
    expect(effectiveDue(task({ importance: "normal" }), TRK_NOW)).toBeNull();
    expect(effectiveDue(task({ importance: "nice_to_have", dueAt: TRK_DUE }), TRK_NOW)).toBe(
      TRK_DUE,
    );
  });

  it("measures the ASAP day on the frozen clock of a waiting task", () => {
    const input = task({ importance: "asap", waitingSince: LATE_EVENING_UTC, accountTz: "UTC" });
    expect(effectiveDue(input, addDays(LATE_EVENING_UTC, 5))).toBe("2026-10-06T23:59:59.999Z");
  });
});

const toIso = (ms: number): string => new Date(ms).toISOString();
const NOW_MS = Date.parse(TRK_NOW);
const pastArb = fc.integer({ max: NOW_MS, min: NOW_MS - 400 * DAY * 60_000 }).map(toIso);
const aroundArb = fc
  .integer({ max: NOW_MS + 60 * DAY * 60_000, min: NOW_MS - 30 * DAY * 60_000 })
  .map(toIso);
const unitArb = fc.double({ max: 1, min: 0, noNaN: true });
const workArb = fc.record({
  estimateHours: fc.double({ max: 200, min: 0, noNaN: true }),
  progress: unitArb,
});
const deadlineArb = fc.oneof(
  fc.constant({ kind: "hard" as const }),
  fc.record({
    kind: fc.constant("resubmission" as const),
    softDays: fc.integer({ max: 14, min: 0 }),
    finalAt: fc.option(aroundArb, { nil: null }),
  }),
);
const rankArb = fc.option(
  fc
    .integer({ max: 10, min: 1 })
    .chain((size) =>
      fc.record({ position: fc.integer({ max: size, min: 1 }), size: fc.constant(size) }),
    ),
  { nil: null },
);

const inputArb = (importance: Importance): fc.Arbitrary<UrgencyInput> =>
  fc
    .record({
      importanceSetAt: fc.option(pastArb, { nil: null }),
      policy: fc.constantFrom("pace", "lag", "age", "resubmission"),
      createdAt: pastArb,
      startAt: fc.option(pastArb, { nil: null }),
      dueAt: fc.option(aroundArb, { nil: null }),
      deadline: deadlineArb,
      whole: workArb,
      remaining: workArb,
      calibration: fc.double({ max: 5, min: 0.1, noNaN: true }),
      waitingSince: fc.option(pastArb, { nil: null }),
      rank: rankArb,
      accountTz: fc.constantFrom("UTC", "Europe/Moscow", "America/Los_Angeles"),
    })
    .map(({ whole, ...rest }) =>
      task({ ...rest, importance, progress: whole.progress, estimateHours: whole.estimateHours }),
    );

const POLICIES = { age, lag, pace, resubmission } as const;

describe("implicit horizons", () => {
  it("never lower the urgency below the task's own policy", () => {
    fc.assert(
      fc.property(fc.constantFrom("asap", "prioritized"), (importance) => {
        fc.assert(
          fc.property(inputArb(importance), (input) => {
            const score = scoreTask(input, TRK_NOW);
            const own = POLICIES[input.policy](input, TRK_NOW);
            const implicit = pace({ ...input, dueAt: score.effectiveDue }, TRK_NOW);
            expect(score.urgency).toBeGreaterThanOrEqual(own);
            expect(score.urgency).toBeCloseTo(Math.max(own, implicit), 10);
          }),
        );
      }),
    );
  });
});

describe("one scale", () => {
  it("never lets a Nice-to-have without a due date outrank a Normal task", () => {
    fc.assert(
      fc.property(inputArb("nice_to_have"), inputArb("normal"), (nice, normal) => {
        const aged = scoreTask({ ...nice, dueAt: null }, TRK_NOW);
        const agedWithDue = scoreTask({ ...nice, policy: "age" }, TRK_NOW);
        const plain = scoreTask({ ...normal, startAt: null }, TRK_NOW);
        expect(aged.score).toBeLessThan(plain.score);
        expect(agedWithDue.score).toBeLessThan(plain.score);
        expect(plain.score).toBeGreaterThanOrEqual(MULTIPLIERS.normal * U_FLOOR);
      }),
    );
  });
});

const scored = (value: number): Score => ({
  score: value,
  urgency: value,
  multiplier: 1,
  rankBonus: 0,
  policy: "age",
  effectiveDue: null,
  hidden: false,
  frozenAt: null,
});
const ranked = (value: number, dueAt: null | string, createdAt: string): Ranked => ({
  score: scored(value),
  tieBreak: { dueAt, createdAt },
});

describe("compareScores", () => {
  it("orders by score descending, then due ascending with no due last, then createdAt", () => {
    const entries = [
      ranked(1, null, "2026-01-01T00:00:00.000Z"),
      ranked(2, "2026-02-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
      ranked(2, "2026-01-15T00:00:00.000Z", "2026-01-02T00:00:00.000Z"),
      ranked(2, null, "2026-01-01T00:00:00.000Z"),
      ranked(2, "2026-01-15T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
    ];
    const sorted = entries.toSorted(compareScores);
    expect(sorted.map((entry) => entries.indexOf(entry))).toEqual([4, 2, 1, 3, 0]);
  });

  it("is a total order", () => {
    const entryArb = fc
      .record({
        value: fc.constantFrom(0, 0.75, 1.5, 3.158),
        dueAt: fc.option(fc.constantFrom(TRK_DUE, TRK_NOW), { nil: null }),
        createdAt: fc.constantFrom(TRK_START, TRK_NOW),
      })
      .map(({ createdAt, dueAt, value }) => ranked(value, dueAt, createdAt));
    fc.assert(
      fc.property(entryArb, entryArb, entryArb, (first, second, third) => {
        const forward = compareScores(first, second);
        const backward = compareScores(second, first);
        const onward = compareScores(second, third);
        const across = compareScores(first, third);
        expect(compareScores(first, first)).toBe(0);
        expect(Math.sign(forward) + Math.sign(backward)).toBe(0);
        // Transitivity: first ≤ second ≤ third implies first ≤ third.
        const isTransitive = forward > 0 || onward > 0 || across <= 0;
        expect(isTransitive).toBe(true);
      }),
    );
  });
});

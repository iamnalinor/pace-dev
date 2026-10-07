import { describe, expect, it } from "vitest";

import type { ExplainKey } from "./trace.ts";

import { addMinutesIso } from "../time.ts";
import { AGE_TAU_DAYS, LAG_GAIN, PACE_MIN_HOURS, U_FLOOR, U_MAX } from "./constants.ts";
import { explain, type Explanation } from "./explain.ts";
import { task, trk231, TRK_DUE, TRK_NOW, TRK_START } from "./fixture.fake.ts";
import { scoreTask } from "./score.ts";

const DAY = 24 * 60;
const addDays = (iso: string, days: number): string => addMinutesIso(iso, days * DAY);

const inputValue = (why: Explanation, key: ExplainKey) =>
  why.inputs.find((row) => row.key === key)?.value;
const inputUnit = (why: Explanation, key: ExplainKey) =>
  why.inputs.find((row) => row.key === key)?.unit;
const stepValue = (why: Explanation, key: ExplainKey) =>
  why.steps.find((row) => row.key === key)?.value;
const keys = (rows: readonly { readonly key: ExplainKey }[]) => rows.map((row) => row.key);

describe("explain", () => {
  it("lists the rows of the TRK-231 'Why it's 2nd on Now' card", () => {
    const why = explain(trk231(), TRK_NOW);
    expect(why.policy).toBe("lag");
    expect(why.formula).toBe(`${U_FLOOR} + ${LAG_GAIN} · max(0, r − p)`);
    expect(inputValue(why, "windowElapsed")).toBeCloseTo(65, 10);
    expect(inputUnit(why, "windowElapsed")).toBe("percent");
    expect(inputValue(why, "progress")).toBeCloseTo(40, 10);
    expect(inputValue(why, "multiplier")).toBe(5);
    expect(inputUnit(why, "multiplier")).toBe("x");
    expect(inputValue(why, "rank")).toBe(2);
    expect(inputValue(why, "rankSize")).toBe(3);
    expect(stepValue(why, "behindPace")).toBeCloseTo(0.25, 10);
    expect(stepValue(why, "urgency")).toBeCloseTo(0.625, 10);
    expect(stepValue(why, "rankBonus")).toBeCloseTo(0.1 / 3, 10);
    expect(stepValue(why, "score")).toBeCloseTo(3.158, 3);
    expect(why.score).toEqual(scoreTask(trk231(), TRK_NOW));
  });

  it("keeps the step order from the formula to the score", () => {
    const why = explain(trk231(), TRK_NOW);
    expect(keys(why.steps)).toEqual(["behindPace", "urgency", "rankBonus", "score"]);
  });

  it("shows work left and hours left for a paced homework", () => {
    const input = task({
      policy: "pace",
      dueAt: addMinutesIso(TRK_NOW, 12 * 60),
      progress: 0.25,
      estimateHours: 8,
    });
    const why = explain(input, TRK_NOW);
    expect(why.formula).toBe(`${U_FLOOR} + (1 − p) · E / max(h, ${PACE_MIN_HOURS})`);
    expect(inputValue(why, "progress")).toBe(25);
    expect(inputValue(why, "workLeft")).toBe(6);
    expect(inputUnit(why, "workLeft")).toBe("hours");
    expect(inputValue(why, "hoursLeft")).toBe(12);
    expect(stepValue(why, "urgency")).toBeCloseTo(U_FLOOR + 0.5, 10);
    expect(keys(why.inputs)).not.toContain("rank");
  });

  it("reports the age in days for a task without a due date", () => {
    const why = explain(task({ createdAt: TRK_START }), addDays(TRK_START, 7));
    expect(why.policy).toBe("lag");
    expect(why.formula).toContain(`/ ${AGE_TAU_DAYS}`);
    expect(inputValue(why, "ageDays")).toBe(7);
    expect(inputUnit(why, "ageDays")).toBe("days");
  });

  it("adds the frozen clock and the implicit horizon when they apply", () => {
    const input = task({
      importance: "asap",
      estimateHours: 4,
      waitingSince: "2026-10-06T19:30:00.000Z",
      accountTz: "Europe/Moscow",
    });
    const why = explain(input, addDays(TRK_NOW, 3));
    expect(inputValue(why, "waitingSince")).toBe("2026-10-06T19:30:00.000Z");
    expect(inputValue(why, "implicitDue")).toBe("2026-10-06T20:59:59.999Z");
    expect(stepValue(why, "implicitUrgency")).toBeCloseTo(U_FLOOR + 4 / 1.5, 3);
    expect(stepValue(why, "urgency")).toBe(stepValue(why, "implicitUrgency"));
    expect(why.score.frozenAt).toBe("2026-10-06T19:30:00.000Z");
  });

  it("omits the optional rows for a plain task", () => {
    const why = explain(task(), TRK_NOW);
    const present = keys(why.inputs);
    expect(present).not.toContain("waitingSince");
    expect(present).not.toContain("implicitDue");
    expect(keys(why.steps)).not.toContain("implicitUrgency");
  });

  it("walks through the resubmission pieces", () => {
    const input = task({
      policy: "resubmission",
      dueAt: TRK_DUE,
      deadline: { kind: "resubmission", softDays: 7, finalAt: addDays(TRK_DUE, 20) },
      progress: 0.9,
      remaining: { progress: 0.9, estimateHours: 4 },
      estimateHours: 4,
    });
    const inSoftWindow = explain(input, addDays(TRK_DUE, 2));
    expect(inputValue(inSoftWindow, "softTarget")).toBe(addDays(TRK_DUE, 7));
    expect(inputValue(inSoftWindow, "hoursLeft")).toBe(5 * 24);

    const afterSoft = explain(input, addDays(TRK_DUE, 9));
    expect(afterSoft.formula).toContain("u(soft)");
    expect(inputValue(afterSoft, "daysAfterSoftTarget")).toBe(2);
    expect(keys(afterSoft.inputs)).not.toContain("hoursLeft");
    expect(stepValue(afterSoft, "urgencyAtSoftTarget")).toBeCloseTo(U_FLOOR + 0.4 / 0.5, 10);
    expect(stepValue(afterSoft, "urgency")).toBeCloseTo(U_FLOOR + 0.8 + 0.2, 10);

    const afterFinal = explain(input, addDays(TRK_DUE, 21));
    expect(afterFinal.formula).toBe(String(U_MAX));
    expect(inputValue(afterFinal, "finalAt")).toBe(addDays(TRK_DUE, 20));
    expect(stepValue(afterFinal, "finalPassed")).toBe(1);
    expect(afterFinal.score.urgency).toBe(U_MAX);
  });
});

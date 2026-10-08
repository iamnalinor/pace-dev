import { describe, expect, it } from "vitest";

import type { WhyModel } from "./why.ts";

import { whyText } from "./why-text.ts";

const context = {
  importance: "prioritized" as const,
  instant: (iso: string) => `at ${iso.slice(11, 16)}`,
  language: "en" as const,
  rank: { position: 2, size: 3 },
};

describe("whyText", () => {
  it("reads TRK-231's card in titled blocks: the lag, the multiplier, the merged rank, the total", () => {
    const model: WhyModel = {
      formula: [],
      groups: [
        {
          name: "work",
          rows: [
            { key: "windowElapsed", unit: "percent", value: 65 },
            { key: "progress", unit: "percent", value: 40 },
            { key: "behindPace", unit: null, value: 0.25 },
          ],
        },
        {
          name: "importance",
          rows: [
            { key: "multiplier", unit: "x", value: 5 },
            { key: "rank", unit: null, value: 2 },
            { key: "rankSize", unit: null, value: 3 },
          ],
        },
        { name: "result", rows: [{ key: "score", unit: null, value: 6.123 }] },
      ],
      policy: "lag",
    };
    const text = whyText(model, context);
    expect(text.groups.map((group) => group.title)).toEqual(["Work", "Importance", "Result"]);
    expect(
      text.groups
        .flatMap((group) => group.lines)
        .map(({ label, tone, value }) => [label, value, tone]),
    ).toEqual([
      ["Window elapsed", "65%", "plain"],
      ["Progress", "40%", "plain"],
      ["Behind pace", "+0.25", "warn"],
      ["Prioritized", "× 5", "plain"],
      ["Your rank in Prioritized", "2 of 3", "plain"],
      ["Score", "6.12", "total"],
    ]);
  });

  it("formats spans, instants and empty values, and fills the formula", () => {
    const hoursLeft = { key: "hoursLeft", unit: "hours", value: 130.25 } as const;
    const model: WhyModel = {
      formula: [
        { kind: "text", text: "0.25 + " },
        { kind: "value", row: { key: "workLeft", unit: "hours", value: 1 } },
        { kind: "text", text: " / max(" },
        { kind: "value", row: hoursLeft },
        { kind: "text", text: ", 0.5)" },
      ],
      groups: [
        {
          name: "time",
          rows: [
            hoursLeft,
            { key: "ageDays", unit: "days", value: 12.5 },
            { key: "implicitDue", unit: null, value: "2026-10-06T20:59:00.000Z" },
            { key: "finalAt", unit: null, value: null },
          ],
        },
      ],
      policy: "pace",
    };
    const text = whyText(model, { ...context, rank: null });
    expect(text.groups[0]?.lines.map(({ value }) => value)).toEqual([
      "5d 10h",
      "12d",
      "at 20:59",
      "—",
    ]);
    expect(text.formula.map(({ isValue, text: run }) => ({ isValue, text: run }))).toEqual([
      { isValue: false, text: "0.25 + " },
      { isValue: true, text: "1h" },
      { isValue: false, text: " / max(" },
      { isValue: true, text: "5d 10h" },
      { isValue: false, text: ", 0.5)" },
    ]);
  });
});

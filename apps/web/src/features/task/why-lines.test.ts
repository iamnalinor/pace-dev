import { describe, expect, it } from "vitest";

import { MOSCOW } from "@pace/core/testing";

import { whyLines, whyTitle } from "./why-lines.ts";

const context = {
  importance: "prioritized" as const,
  language: "en" as const,
  rank: { position: 2, size: 3 },
  tz: MOSCOW,
};

describe("whyLines", () => {
  it("reads TRK-231's card: percentages, the lag, the multiplier and the merged rank", () => {
    const lines = whyLines(
      [
        { key: "windowElapsed", unit: "percent", value: 65 },
        { key: "progress", unit: "percent", value: 40 },
        { key: "behindPace", unit: null, value: 0.25 },
        { key: "multiplier", unit: "x", value: 5 },
        { key: "rank", unit: null, value: 2 },
        { key: "rankSize", unit: null, value: 3 },
        { key: "score", unit: null, value: 6.123 },
      ],
      context,
    );
    expect(lines.map(({ label, tone, value }) => [label, value, tone])).toEqual([
      ["Window elapsed", "65%", "plain"],
      ["Progress", "40%", "plain"],
      ["Behind pace", "+0.25", "warn"],
      ["Prioritized", "× 5", "plain"],
      ["Your rank in Prioritized", "2 of 3", "plain"],
      ["Score", "6.12", "plain"],
    ]);
  });

  it("formats hours, days, instants and empty values", () => {
    const lines = whyLines(
      [
        { key: "hoursLeft", unit: "hours", value: 36 },
        { key: "ageDays", unit: "days", value: 12 },
        { key: "implicitDue", unit: null, value: "2026-10-06T20:59:00.000Z" },
        { key: "finalAt", unit: null, value: null },
        { key: "behindPace", unit: null, value: -0.1 },
        { key: "rank", unit: null, value: 1 },
      ],
      { ...context, rank: null },
    );
    expect(lines.map(({ value }) => value)).toEqual([
      "36h",
      "12 days",
      "Oct 6, 23:59",
      "—",
      "-0.1",
    ]);
    expect(lines.find((line) => line.label === "Behind pace")?.tone).toBe("plain");
  });
});

describe("whyTitle", () => {
  it("names the place on the board", () => {
    expect(whyTitle(0, "en")).toBe("Why it's on top");
    expect(whyTitle(1, "en")).toBe("Why it's 2nd on Now");
    expect(whyTitle(-1, "en")).toBe("Why it's on Now");
  });
});

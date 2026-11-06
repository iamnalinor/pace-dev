import { describe, expect, it } from "vitest";

import { type Drawn, layoutWeek } from "./week-layout.ts";

const DATE = "2026-10-06T00:00:00.000Z";
const at = (hhmm: string): string => `2026-10-06T${hhmm}:00.000Z`;
const block = (id: string, from: string, to: string) => ({
  endAt: at(to),
  id,
  startAt: at(from),
});

const layout = (
  blocks: readonly ReturnType<typeof block>[],
  options: { readonly maxLanes?: number; readonly hourPx?: number } = {},
) => {
  const [day] = layoutWeek({
    calendar: [],
    days: [{ blocks, date: DATE }],
    fromHour: 7,
    hourPx: options.hourPx ?? 18,
    minPx: 24,
    zone: "UTC",
    ...(options.maxLanes !== undefined && { maxLanes: options.maxLanes }),
  });
  if (day === undefined) {
    throw new Error("no day");
  }
  return day;
};

/** No two boxes of one lane overlap, as drawn. */
const isClear = (entries: readonly Drawn<unknown>[]): boolean =>
  entries.every((a, index) =>
    entries
      .slice(index + 1)
      .every((b) => a.lane !== b.lane || a.top + a.height <= b.top || b.top + b.height <= a.top),
  );

describe("layoutWeek", () => {
  it("gives 5 overlapping 20-minute blocks 5 lanes, each drawn at the height its lane was made for", () => {
    const day = layout(
      ["10:00", "10:05", "10:10", "10:15", "10:20"].map((from, index) =>
        block(`b${String(index)}`, from, `10:${String(20 + index * 5)}`),
      ),
    );
    expect(day.entries.map((entry) => entry.lanes)).toEqual([5, 5, 5, 5, 5]);
    expect(new Set(day.entries.map((entry) => entry.lane)).size).toBe(5);
    // 20 minutes is 6 px at 18 px an hour: drawn at the 24 px target, and lanes were laid on 24.
    expect(day.entries.every((entry) => entry.height === 24)).toBe(true);
    expect(isClear(day.entries)).toBe(true);
  });

  it("puts a 3-minute item at 23:56 wholly inside the room under the last hour, covering no neighbour", () => {
    const day = layout([block("before", "23:30", "23:55"), block("last", "23:56", "24:00")]);
    const hoursPx = 17 * 18;
    const last = day.entries.find(
      (entry) => "block" in entry.item && entry.item.block.id === "last",
    );
    expect(last).toBeDefined();
    // It hangs under midnight by the room the column keeps there (`overhang`), never past it.
    expect(day.overhang).toBeGreaterThan(0);
    expect(day.overhang).toBeLessThanOrEqual(24);
    expect((last?.top ?? 0) + (last?.height ?? 0)).toBeLessThanOrEqual(hoursPx + day.overhang);
    expect(isClear(day.entries)).toBe(true);
    // The item before it, drawn 25 min at 18 px/h = 7.5 → 24, ends under the last one's top, or in
    // another lane.
    expect(day.entries.every((entry) => entry.top >= 0)).toBe(true);
  });

  it("folds a run that needs more lanes than the column has into one block", () => {
    const day = layout(
      Array.from({ length: 8 }, (_, index) => block(`b${String(index)}`, "10:00", "10:20")),
      { maxLanes: 6 },
    );
    expect(day.entries).toHaveLength(0);
    expect(day.folds).toHaveLength(1);
    expect(day.folds[0]?.items).toHaveLength(8);
    const calm = layout(
      Array.from({ length: 6 }, (_, index) => block(`b${String(index)}`, "10:00", "10:20")),
      { maxLanes: 6 },
    );
    expect(calm.folds).toHaveLength(0);
    expect(calm.entries).toHaveLength(6);
  });

  it("draws the day's line over 24 hours", () => {
    const day = layout([block("a", "06:00", "12:00")]);
    expect(day.line[0]?.left).toBeCloseTo(0.25, 5);
    expect(day.line[0]?.width).toBeCloseTo(0.25, 5);
  });
});

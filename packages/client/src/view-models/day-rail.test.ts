import { describe, expect, it } from "vitest";

import { dayRail, GAP_CAP_MINUTES, type RailBlock, type RailGap } from "./day-rail.ts";

const at = (time: string): string => `2026-10-06T${time}:00.000Z`;

const block = (from: string, to: string, extra: Partial<RailBlock> = {}): RailBlock => ({
  color: "blue",
  endAt: at(to),
  isAlongside: false,
  isRunning: false,
  startAt: at(from),
  ...extra,
});

const gap = (from: string, to: string): RailGap => ({ endAt: at(to), startAt: at(from) });

const length = (item: { readonly from: number; readonly to: number }): number =>
  item.to - item.from;

describe("dayRail (Task 7.1: the notebook page's proportional rail)", () => {
  it("draws a 2 h gap twice as long as a 1 h block, in time order from 0", () => {
    const { items } = dayRail(
      [block("08:00", "09:00"), block("11:00", "12:00")],
      [gap("09:00", "11:00")],
      at("23:00"),
    );
    expect(items.map((item) => item.kind)).toEqual(["block", "gap", "block"]);
    expect(items[0]?.from).toBe(0);
    const [first, middle] = items;
    expect(length(middle ?? { from: 0, to: 0 })).toBe(2 * length(first ?? { from: 0, to: 0 }));
    expect(items[1]?.from).toBe(items[0]?.to);
    expect(items[2]?.from).toBe(items[1]?.to);
  });

  it("caps a long gap at 3 h and marks the scale break", () => {
    const { items } = dayRail(
      [block("00:00", "01:00"), block("16:00", "17:00")],
      [gap("01:00", "16:00")],
      at("23:00"),
    );
    const long = items.find((item) => item.kind === "gap");
    expect(long).toBeDefined();
    expect(length(long ?? { from: 0, to: 0 })).toBe(GAP_CAP_MINUTES);
    expect(long?.scaleBreak).toBe(true);
    expect(items.find((item) => item.kind === "block")?.scaleBreak).toBe(false);
    // What follows the capped gap starts where the gap's drawn length ends.
    expect(items.at(-1)?.from).toBe(60 + GAP_CAP_MINUTES);
  });

  it("makes a block that overlaps an earlier one parallel, with the overlapping stretch", () => {
    const { items } = dayRail(
      [block("08:00", "10:00"), block("09:00", "09:30", { color: "green" })],
      [],
      at("23:00"),
    );
    const parallel = items.find((item) => item.kind === "parallel");
    expect(parallel).toMatchObject({ from: 60, hue: "green", to: 90 });
    expect(parallel?.overlap).toEqual({ from: 60, to: 90 });
    expect(items.find((item) => item.kind === "block")?.overlap).toBeNull();
  });

  it("makes a block that ran alongside the main line parallel, with no hatching", () => {
    const { items } = dayRail(
      [block("08:00", "09:00"), block("08:10", "08:20", { isAlongside: true })],
      [],
      at("23:00"),
    );
    expect(items.find((item) => item.kind === "parallel")).toMatchObject({
      from: 10,
      overlap: null,
      to: 20,
    });
  });

  it("marks the running block open, and puts now on the rail while it is inside it", () => {
    const { items, nowAt } = dayRail(
      [block("08:00", "09:30", { isRunning: true })],
      [],
      at("09:30"),
    );
    expect(items[0]?.open).toBe(true);
    expect(nowAt).toBe(90);
  });

  it("has no now outside what is drawn, and nothing for an empty day", () => {
    expect(dayRail([block("08:00", "09:00")], [], at("12:00")).nowAt).toBeNull();
    expect(dayRail([], [], at("12:00"))).toEqual({ items: [], nowAt: null, total: 0 });
  });

  it("moves now through a capped gap in proportion to its drawn length", () => {
    const { nowAt } = dayRail(
      [block("00:00", "01:00"), block("16:00", "17:00")],
      [gap("01:00", "16:00")],
      at("08:30"),
    );
    // Halfway through a 15 h gap drawn as 3 h: 60 + 90.
    expect(nowAt).toBe(60 + GAP_CAP_MINUTES / 2);
  });
});

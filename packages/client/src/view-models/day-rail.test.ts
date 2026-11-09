import { describe, expect, it } from "vitest";

import { dayRail, type RailBlock, type RailEntry } from "./day-rail.ts";

const at = (time: string): string => `2026-10-06T${time}:00.000Z`;

const block = (from: string, to: string, extra: Partial<RailBlock> = {}): RailEntry => ({
  key: `block-${from}-${String(extra.isAlongside ?? false)}`,
  kind: "activity",
  row: {
    color: "blue",
    endAt: at(to),
    isAlongside: false,
    isRunning: false,
    startAt: at(from),
    ...extra,
  },
});

const gap = (from: string, to: string): RailEntry => ({
  gap: { endAt: at(to), startAt: at(from) },
  key: `gap-${from}`,
  kind: "gap",
});

describe("dayRail (Task 7.1: one bar beside each row of the day)", () => {
  it("gives every row its own bar, in the rows' order and keyed like them", () => {
    const entries = [block("08:00", "09:00"), gap("09:00", "11:00"), block("11:00", "12:00")];
    const { bars } = dayRail(entries, at("23:00"));
    expect(bars.map((bar) => bar.key)).toEqual(entries.map((entry) => entry.key));
    expect(bars.map((bar) => bar.kind)).toEqual(["block", "gap", "block"]);
  });

  it("draws a block in its category's hue and a gap in none", () => {
    const { bars } = dayRail(
      [block("08:00", "10:00", { color: "green" }), gap("10:00", "12:00")],
      at("23:00"),
    );
    expect(bars.map((bar) => bar.hue)).toEqual(["green", null]);
  });

  it("makes a block that ran alongside, or overlaps an earlier one, parallel", () => {
    const { bars } = dayRail(
      [
        block("08:00", "10:00"),
        block("08:10", "08:20", { isAlongside: true }),
        block("09:00", "11:00"),
        block("11:00", "12:00"),
      ],
      at("23:00"),
    );
    expect(bars.map((bar) => bar.kind)).toEqual(["block", "parallel", "parallel", "block"]);
  });

  it("marks the running block, and puts now at the end of its row", () => {
    const running = block("08:00", "09:30", { isRunning: true });
    const { bars, now } = dayRail([running], at("09:30"));
    expect(bars[0]?.isRunning).toBe(true);
    expect(now).toEqual({ at: 1, key: running.key });
  });

  it("puts now inside the row whose time holds it, in proportion to the row", () => {
    const later = gap("09:00", "11:00");
    expect(dayRail([block("08:00", "09:00"), later], at("10:30")).now).toEqual({
      at: 0.75,
      key: later.key,
    });
  });

  it("puts now at the last running row, so every running bar ends on the line (design review H4)", () => {
    const main = block("08:00", "10:00", { isRunning: true });
    const alongside = block("08:30", "10:00", { isAlongside: true, isRunning: true });
    expect(dayRail([main, alongside], at("10:00")).now).toEqual({ at: 1, key: alongside.key });
    expect(dayRail([main], at("10:00")).now?.key).toBe(main.key);
  });

  it("keeps now on a running row whose end was read a tick before the clock (design review H4)", () => {
    // The day's model and the screen's clock tick apart: the running row's end may lag now.
    const running = block("08:00", "09:30", { isRunning: true });
    expect(dayRail([running], at("09:31")).now).toEqual({ at: 1, key: running.key });
  });

  it("has no now outside the rows, and nothing for an empty day", () => {
    expect(dayRail([block("08:00", "09:00")], at("12:00")).now).toBeNull();
    expect(dayRail([], at("12:00"))).toEqual({ bars: [], now: null });
  });
});

import { inkLine } from "./ink-line.ts";

describe("inkLine", () => {
  it("has nothing to draw without an Expect", () => {
    expect(inkLine(10, null)).toBeNull();
    expect(inkLine(10, 0)).toBeNull();
  });

  it("puts the mark at expected / max(expected × 2, elapsed) of the width", () => {
    expect(inkLine(5, 20)?.mark).toBeCloseTo(0.5);
    expect(inkLine(39, 20)?.mark).toBeCloseTo(0.5);
    expect(inkLine(80, 20)?.mark).toBeCloseTo(0.25);
    expect(inkLine(100, 20)?.mark).toBeCloseTo(0.2);
  });

  it("draws the line to now, full once the time has doubled", () => {
    expect(inkLine(10, 20)?.fill).toBeCloseTo(0.25);
    expect(inkLine(40, 20)?.fill).toBeCloseTo(1);
    expect(inkLine(100, 20)?.fill).toBeCloseTo(1);
  });

  it("turns warn at twice the Expect, not before", () => {
    expect(inkLine(39, 20)?.isPast).toBe(false);
    expect(inkLine(40, 20)?.isPast).toBe(true);
  });
});

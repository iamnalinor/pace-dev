import { describe, expect, it } from "vitest";

import { formatCount, formatNumber, formatPercent } from "./numbers.ts";

const NARROW_NBSP = "\u{202F}";

describe("formatNumber", () => {
  it("uses the language's decimal separator", () => {
    expect(formatNumber(3.3, "ru")).toBe("3,3");
    expect(formatNumber(3.3, "en")).toBe("3.3");
  });

  it("pads or trims the fraction to the requested digits", () => {
    expect(formatNumber(0, "ru", { fraction: 1 })).toBe("0,0");
    expect(formatNumber(3, "en", { fraction: 1 })).toBe("3.0");
    expect(formatNumber(3.349, "ru", { fraction: 1 })).toBe("3,3");
    expect(formatNumber(3.25, "en", { fraction: 0 })).toBe("3");
  });

  it("keeps the fraction the number has when none is requested", () => {
    expect(formatNumber(2, "ru")).toBe("2");
    expect(formatNumber(2.5, "ru")).toBe("2,5");
  });

  it("groups thousands with a narrow no-break space in Russian and a comma in English", () => {
    expect(formatNumber(1284.5, "ru")).toBe(`1${NARROW_NBSP}284,5`);
    expect(formatNumber(1_284_567, "en")).toBe("1,284,567");
  });

  it("never prints negative zero", () => {
    expect(formatNumber(-0.04, "ru", { fraction: 1 })).toBe("0,0");
  });
});

describe("formatCount", () => {
  it("groups Russian counts with U+202F", () => {
    expect(formatCount(1284, "ru")).toBe("1\u{202F}284");
    expect(formatCount(1_000_000, "ru")).toBe("1\u{202F}000\u{202F}000");
  });

  it("leaves small counts alone", () => {
    expect(formatCount(0, "ru")).toBe("0");
    expect(formatCount(999, "ru")).toBe("999");
  });

  it("groups English counts with a comma", () => {
    expect(formatCount(1284, "en")).toBe("1,284");
  });

  it("rounds a fractional count to a whole one", () => {
    expect(formatCount(41.6, "en")).toBe("42");
  });
});

describe("formatPercent", () => {
  it("sets the percent sign off with a no-break space in Russian", () => {
    expect(formatPercent(30, "ru")).toBe("30\u{A0}%");
    expect(formatPercent(0, "ru")).toBe("0\u{A0}%");
  });

  it("sets it tight in English and rounds to whole percents", () => {
    expect(formatPercent(29.6, "en")).toBe("30%");
  });
});

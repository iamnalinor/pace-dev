import { afterEach, describe, expect, it, vi } from "vitest";

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

const fresh = async () => await import("./numbers.ts");

describe("without a working Intl.NumberFormat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const WITHOUT = {
    "no NumberFormat": undefined,
    "no formatToParts": class {
      format(): string {
        return "?";
      }
    },
    "a constructor that throws": new Proxy(Object, {
      construct: () => {
        throw new RangeError("Incorrect locale information provided");
      },
    }),
  } as const;

  it.each(Object.entries(WITHOUT))("groups and separates by hand with %s", async (_name, stub) => {
    vi.stubGlobal("Intl", Object.create(Intl, { NumberFormat: { value: stub } }));
    const { formatCount, formatNumber, formatPercent } = await fresh();
    expect(formatNumber(3.3, "ru")).toBe("3,3");
    expect(formatNumber(3.3, "en")).toBe("3.3");
    expect(formatNumber(0, "ru", { fraction: 1 })).toBe("0,0");
    expect(formatNumber(3.349, "ru", { fraction: 1 })).toBe("3,3");
    expect(formatNumber(1284.5, "ru")).toBe("1\u{202F}284,5");
    expect(formatNumber(1_284_567, "en")).toBe("1,284,567");
    expect(formatNumber(-1284.5, "en")).toBe("-1,284.5");
    expect(formatNumber(-0.04, "ru", { fraction: 1 })).toBe("0,0");
    expect(formatCount(1_000_000, "ru")).toBe("1\u{202F}000\u{202F}000");
    expect(formatCount(999, "ru")).toBe("999");
    expect(formatPercent(30, "ru")).toBe("30\u{A0}%");
  });

  it("builds one formatter per language and fraction, not one per call", async () => {
    const real = Intl.NumberFormat;
    const made = vi.fn(
      (...args: ConstructorParameters<typeof Intl.NumberFormat>) => new real(...args),
    );
    vi.stubGlobal("Intl", Object.create(Intl, { NumberFormat: { value: made } }));
    const { formatCount, formatNumber } = await fresh();
    formatCount(1, "ru");
    formatCount(2, "ru");
    formatNumber(1.5, "ru", { fraction: 1 });
    formatNumber(2.5, "ru", { fraction: 1 });
    formatCount(3, "en");
    expect(made).toHaveBeenCalledTimes(3);
  });
});

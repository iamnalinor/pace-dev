import { describe, expect, it } from "vitest";

import { formatList, formatNumber, formatOrdinal, formatPercent } from "./number.ts";

describe("formatOrdinal", () => {
  it("uses English suffixes", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 22, 101].map((n) => formatOrdinal(n, "en"))).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "22nd",
      "101st",
    ]);
  });

  it("uses the Russian neuter suffix", () => {
    expect(formatOrdinal(2, "ru")).toBe("2-е");
  });
});

describe("formatList", () => {
  it("joins with the language's conjunction", () => {
    expect(formatList(["3", "4"], "en")).toBe("3 and 4");
    expect(formatList(["3", "4", "7a"], "en")).toBe("3, 4, and 7a");
    expect(formatList(["3", "4"], "ru")).toBe("3 и 4");
    expect(formatList(["5"], "en")).toBe("5");
  });
});

describe("formatPercent and formatNumber", () => {
  it("round a fraction to whole percent and a number to two decimals", () => {
    expect(formatPercent(0.65, "en")).toBe("65%");
    expect(formatPercent(0.8234, "en")).toBe("82%");
    expect(formatNumber(0.25, "en")).toBe("0.25");
    expect(formatNumber(5, "en")).toBe("5");
    expect(formatNumber(1 / 3, "en")).toBe("0.33");
    expect(formatNumber(0.25, "ru")).toBe("0,25");
  });
});

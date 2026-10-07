import { describe, expect, it } from "vitest";

import { formatAge, formatLate, formatMinutes } from "./duration.ts";

describe("formatMinutes", () => {
  it("renders hours and minutes, with a tilde when approximate", () => {
    expect(formatMinutes(100, "en")).toBe("1h 40m");
    expect(formatMinutes(100, "en", { approx: true })).toBe("~1h 40m");
    expect(formatMinutes(100, "ru")).toBe("1 ч 40 м");
  });
});

describe("formatLate", () => {
  it("counts whole days from half a day on (15h late reads as 1 day late)", () => {
    expect(formatLate(15 * 60 + 1, "en")).toBe("1 day late");
    expect(formatLate(25 * 60, "en")).toBe("2 days late");
    expect(formatLate(15 * 60 + 1, "ru")).toBe("опоздание 1 день");
    expect(formatLate(5 * 24 * 60, "ru")).toBe("опоздание 5 дней");
  });

  it("shows the duration under half a day", () => {
    expect(formatLate(3 * 60, "en")).toBe("3h late");
    expect(formatLate(25, "en")).toBe("25m late");
  });
});

describe("formatAge", () => {
  it("pluralises days", () => {
    expect(formatAge(12, "en")).toBe("12 days old");
    expect(formatAge(1, "en")).toBe("1 day old");
    expect(formatAge(2, "ru")).toBe("2 дня");
    expect(formatAge(5, "ru")).toBe("5 дней");
  });
});

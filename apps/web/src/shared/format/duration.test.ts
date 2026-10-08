import { describe, expect, it } from "vitest";

import { formatMinutes } from "./duration.ts";

describe("formatMinutes", () => {
  it("renders hours and minutes, with a tilde when approximate", () => {
    expect(formatMinutes(100, "en")).toBe("1h 40m");
    expect(formatMinutes(100, "en", { approx: true })).toBe("~1h 40m");
    expect(formatMinutes(100, "ru")).toBe("1 ч 40 м");
  });
});

import { describe, expect, it } from "vitest";

import { formatCount } from "./plural.ts";

describe("formatCount", () => {
  it("picks the CLDR form of the language", () => {
    expect(formatCount("en", 1, "meta.problemsLeft")).toBe("1 problem left");
    expect(formatCount("en", 2, "meta.problemsLeft")).toBe("2 problems left");
    expect(formatCount("ru", 1, "meta.problemsLeft")).toBe("осталась 1 задача");
    expect(formatCount("ru", 3, "meta.problemsLeft")).toBe("осталось 3 задачи");
    expect(formatCount("ru", 7, "meta.problemsLeft")).toBe("осталось 7 задач");
  });
});

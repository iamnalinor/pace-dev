import { describe, expect, it } from "vitest";

import { fragmentationTiles } from "./insights-text.ts";

const fragmentation = {
  focusBlocks: 12,
  medianFocusMinutes: 125,
  shortFocusShare: 0.15,
  switchesPerDay: 3.3,
};

const values = (language: "en" | "ru", overrides = {}) =>
  fragmentationTiles({ ...fragmentation, ...overrides }, language)?.map((tile) => tile.value);

describe("fragmentationTiles", () => {
  it("writes the numbers the way the language does (F-CPY-04)", () => {
    expect(values("ru")).toEqual(["2\u{A0}ч 05\u{A0}мин", "15\u{A0}%", "3,3"]);
    expect(values("en")).toEqual(["2h 5m", "15%", "3.3"]);
  });

  it("keeps one decimal on a round or zero rate", () => {
    expect(values("ru", { switchesPerDay: 0 })?.[2]).toBe("0,0");
    expect(values("ru", { switchesPerDay: 4 })?.[2]).toBe("4,0");
  });

  it("is absent when nothing was tracked", () => {
    expect(
      fragmentationTiles(
        { ...fragmentation, medianFocusMinutes: null, switchesPerDay: null },
        "ru",
      ),
    ).toBeNull();
  });
});

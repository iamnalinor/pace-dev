import { describe, expect, it } from "vitest";

import { ACTIVITY_CATEGORIES, CATEGORY_HUES } from "./categories.ts";

const byName = (a: string, b: string): number => a.localeCompare(b);

describe("CATEGORY_HUES", () => {
  it("gives each of the twelve categories its own hue", () => {
    expect(Object.keys(CATEGORY_HUES).toSorted(byName)).toEqual(
      [...ACTIVITY_CATEGORIES].toSorted(byName),
    );
    expect(new Set(Object.values(CATEGORY_HUES)).size).toBe(12);
  });

  it("maps the categories as the design chose", () => {
    expect(CATEGORY_HUES).toEqual({
      work: "blue",
      study: "violet",
      task: "green",
      food: "orange",
      commute: "lime",
      hygiene: "cyan",
      rest: "teal",
      chores: "amber",
      social: "pink",
      sport: "red",
      sleep: "indigo",
      other: "slate",
    });
  });
});

import { describe, expect, it } from "vitest";

import { typedActivity } from "./typed.ts";

describe("a typed activity", () => {
  it("takes the length out of the words: it becomes the Expect", () => {
    expect(typedActivity("Пошел в ЦСС, 20мин")).toEqual({
      expectMinutes: 20,
      label: "Пошел в ЦСС",
    });
    expect(typedActivity("walk the dog 1.5h")).toEqual({
      expectMinutes: 90,
      label: "walk the dog",
    });
  });

  it("keeps the words as they are without a length", () => {
    expect(typedActivity("  Reading  ")).toEqual({ expectMinutes: null, label: "Reading" });
  });

  it("keeps the whole text when it is nothing but a length", () => {
    expect(typedActivity("20 min")).toEqual({ expectMinutes: 20, label: "20 min" });
  });
});

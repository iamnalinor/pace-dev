import { describe, expect, it } from "vitest";

import { BASE_PRESETS } from "./base-presets.ts";
import { byPresetOrder, presetLabel } from "./preset-label.ts";

describe("presetLabel", () => {
  it("translates a default preset only while it keeps its shipped name", () => {
    expect(presetLabel(BASE_PRESETS.hw, "ru")).toBe("Домашка");
    expect(presetLabel({ ...BASE_PRESETS.hw, name: "Учёба" }, "en")).toBe("Учёба");
    expect(presetLabel({ id: "hw.algebra", name: "Algebra HW" }, "ru")).toBe("Algebra HW");
  });
});

describe("byPresetOrder", () => {
  it("sorts by order, then by name", () => {
    const presets = [
      { name: "B", order: 100 },
      { name: "Work", order: 2 },
      { name: "A", order: 100 },
      { name: "Homework", order: 1 },
    ];
    expect(presets.toSorted(byPresetOrder).map((preset) => preset.name)).toEqual([
      "Homework",
      "Work",
      "A",
      "B",
    ]);
  });
});

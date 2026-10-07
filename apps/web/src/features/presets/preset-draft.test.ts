import { describe, expect, it } from "vitest";

import { BASE_PRESETS } from "@pace/core";

import {
  definitionIssues,
  isOverridden,
  setSub,
  setValue,
  slugify,
  toggleOverride,
  toggleSubOverride,
} from "./preset-draft.ts";

const hw = BASE_PRESETS.hw.definition;

describe("toggleOverride", () => {
  it("starts an override from the inherited value and drops it again", () => {
    const overridden = toggleOverride({}, "urgencyPolicy", hw);
    expect(overridden).toEqual({ urgencyPolicy: "pace" });
    expect(isOverridden(overridden, "urgencyPolicy")).toBe(true);
    expect(toggleOverride(overridden, "urgencyPolicy", hw)).toEqual({});
  });

  it("keeps a removed recurrence (null) as an override", () => {
    const definition = setValue(toggleOverride({}, "recurrence", hw), "recurrence", null);
    expect(definition).toEqual({ recurrence: null });
    expect(isOverridden(definition, "recurrence")).toBe(true);
  });
});

describe("toggleSubOverride", () => {
  it("overrides one field or notify key at a time and removes the group when empty", () => {
    const one = toggleSubOverride({}, { group: "notify", key: "criticalHours" }, hw);
    expect(one).toEqual({ notify: { criticalHours: 12 } });
    const two = setSub(
      toggleSubOverride(one, { group: "fields", key: "link" }, hw),
      { group: "fields", key: "link" },
      true,
    );
    expect(two).toEqual({ fields: { link: true }, notify: { criticalHours: 12 } });
    expect(toggleSubOverride(two, { group: "notify", key: "criticalHours" }, hw)).toEqual({
      fields: { link: true },
    });
  });
});

describe("definitionIssues", () => {
  it("names the keys the schema rejects, down to the notify and field keys", () => {
    expect(definitionIssues({ defaultEstimateMinutes: 30 })).toEqual(new Set());
    expect(
      definitionIssues({
        defaultEstimateMinutes: -5,
        deadlinePolicy: { finalAt: null, finalTz: null, kind: "resubmission", softDays: 1.5 },
        notify: { criticalProgress: 2 },
      }),
    ).toEqual(new Set(["defaultEstimateMinutes", "deadlinePolicy", "notify.criticalProgress"]));
  });
});

describe("slugify", () => {
  it("turns a name into a preset id", () => {
    expect(slugify("Linear Algebra HW")).toBe("linear-algebra-hw");
    expect(slugify("  C++ / Rust!! ")).toBe("c-rust");
    expect(slugify("Алгебра")).toBe("");
  });
});

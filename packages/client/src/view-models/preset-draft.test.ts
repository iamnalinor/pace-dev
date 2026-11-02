import { describe, expect, it } from "vitest";

import { BASE_PRESETS, INITIAL_PRESETS_STATE, PresetIdSchema } from "@pace/core";

import {
  definitionIssues,
  editorDraft,
  freePresetId,
  inheritedOf,
  isOverridden,
  newDraft,
  setSub,
  setValue,
  slugify,
  toggleOverride,
  toggleSubOverride,
} from "./preset-draft.ts";

const hw = BASE_PRESETS.hw.definition;

describe("toggleOverride", () => {
  it("starts an override from the inherited value and drops it again", () => {
    const overridden = toggleOverride({}, "defaultImportance", hw);
    expect(overridden).toEqual({ defaultImportance: "normal" });
    expect(isOverridden(overridden, "defaultImportance")).toBe(true);
    expect(toggleOverride(overridden, "defaultImportance", hw)).toEqual({});
  });

  it("keeps a removed recurrence (null) as an override", () => {
    const definition = setValue(toggleOverride({}, "recurrence", hw), "recurrence", null);
    expect(definition).toEqual({ recurrence: null });
    expect(isOverridden(definition, "recurrence")).toBe(true);
  });
});

describe("toggleSubOverride", () => {
  it("overrides one field at a time and removes the group when empty", () => {
    const one = toggleSubOverride({}, { group: "fields", key: "description" }, hw);
    expect(one).toEqual({ fields: { description: true } });
    const two = setSub(
      toggleSubOverride(one, { group: "fields", key: "link" }, hw),
      { group: "fields", key: "link" },
      true,
    );
    expect(two).toEqual({ fields: { description: true, link: true } });
    const three = toggleSubOverride(two, { group: "fields", key: "description" }, hw);
    expect(three).toEqual({ fields: { link: true } });
    expect(toggleSubOverride(three, { group: "fields", key: "link" }, hw)).toEqual({});
  });
});

describe("definitionIssues", () => {
  it("names the keys the schema rejects, down to the field keys", () => {
    expect(definitionIssues({ defaultEstimateMinutes: 30 })).toEqual(new Set());
    expect(
      definitionIssues({
        defaultEstimateMinutes: -5,
        deadlinePolicy: { finalAt: null, finalTz: null, kind: "resubmission", softDays: 1.5 },
        fields: { link: "yes" as unknown as boolean },
      }),
    ).toEqual(new Set(["defaultEstimateMinutes", "deadlinePolicy", "fields.link"]));
  });
});

describe("slugify", () => {
  it("turns a name into a preset id", () => {
    expect(slugify("Linear Algebra HW")).toBe("linear-algebra-hw");
    expect(slugify("  C++ / Rust!! ")).toBe("c-rust");
    expect(slugify("Алгебра")).toBe("algebra");
    expect(slugify("Щи и Чай, ёж")).toBe("schi-i-chay-ezh");
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
    expect(slugify("数学")).toBe("");
  });
});

/** The default presets and one more under `id`. */
const withPreset = (id: string) => ({
  byId: { ...INITIAL_PRESETS_STATE.byId, [id]: { ...BASE_PRESETS.hw, id, name: id } },
});

describe("freePresetId (QA round 18 L4: nobody types an id)", () => {
  it("takes the name's slug while it is free", () => {
    expect(freePresetId(INITIAL_PRESETS_STATE, "Linear Algebra")).toBe("linear-algebra");
    expect(freePresetId(INITIAL_PRESETS_STATE, "Линейная алгебра")).toBe("lineynaya-algebra");
  });

  it("numbers it past a preset already there, an archived one or a default", () => {
    expect(freePresetId(withPreset("algebra"), "Algebra")).toBe("algebra-2");
    expect(freePresetId(withPreset("algebra-2"), "Algebra")).toBe("algebra");
    expect(freePresetId(INITIAL_PRESETS_STATE, "Work")).toBe("work-2");
  });

  it("never takes the new preset form's own address", () => {
    expect(freePresetId(INITIAL_PRESETS_STATE, "New")).toBe("new-2");
  });

  it("names a preset whose name has no letters it can spell, and keeps long ones a valid slug", () => {
    expect(freePresetId(INITIAL_PRESETS_STATE, "数学")).toBe("preset");
    // Cut at 56 right after a word: the hyphen there goes too.
    const name = `${"a".repeat(55)} bcd efg`;
    expect(freePresetId(INITIAL_PRESETS_STATE, name)).toBe("a".repeat(55));
    const numbered = freePresetId(withPreset("a".repeat(55)), name);
    expect(numbered).toBe(`${"a".repeat(55)}-2`);
    expect(PresetIdSchema.safeParse(numbered).success).toBe(true);
  });
});

describe("editorDraft", () => {
  it("opens an untouched default preset with nothing overridden", () => {
    expect(editorDraft(BASE_PRESETS.work)).toEqual({
      definition: {},
      extends: null,
      id: "work",
      name: "Work",
    });
  });

  it("opens an edited default preset and a user preset on what they store", () => {
    expect(
      editorDraft({ ...BASE_PRESETS.work, definition: { color: "coral" } }).definition,
    ).toEqual({
      color: "coral",
    });
    const own = { ...BASE_PRESETS.hw, builtIn: false, definition: {}, extends: "hw", id: "hw.x" };
    expect(editorDraft(own)).toMatchObject({ extends: "hw", id: "hw.x" });
  });
});

describe("inheritedOf", () => {
  const presets = INITIAL_PRESETS_STATE;

  it("reads a default preset's unset keys from its shipped values", () => {
    const draft = { ...editorDraft(BASE_PRESETS.hw), definition: {} };
    expect(inheritedOf(presets, draft)).toBe(BASE_PRESETS.hw.definition);
  });

  it("reads a new preset's unset keys from its parent chain", () => {
    expect(inheritedOf(presets, newDraft("work"))).toEqual(BASE_PRESETS.work.definition);
    expect(inheritedOf(presets, newDraft("gone"))).toBe(BASE_PRESETS.personal.definition);
    expect(inheritedOf(presets, { ...newDraft("x"), extends: null })).toBe(
      BASE_PRESETS.personal.definition,
    );
  });
});

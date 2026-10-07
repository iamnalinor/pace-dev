import { describe, expect, it } from "vitest";

import { BASE_PRESET_IDS, BASE_PRESETS, isBuiltInPreset } from "./base-presets.ts";
import { PresetDefinitionSchema } from "./preset-schema.ts";

const DEFAULT_NOTIFY = {
  criticalHours: 24,
  criticalProgress: 0.5,
  criticalScore: 10,
  inProgressIdleDays: 5,
  waitingDays: 7,
};

const NO_FIELDS = { description: false, startAt: false, submitVia: false, ticket: false };

const byText = (a: string, b: string): number => a.localeCompare(b);

describe("BASE_PRESETS", () => {
  it("lists exactly the five base presets", () => {
    expect(BASE_PRESET_IDS).toEqual(["hw", "work", "personal", "deferred", "inbox"]);
    expect(Object.keys(BASE_PRESETS).toSorted(byText)).toEqual(
      [...BASE_PRESET_IDS].toSorted(byText),
    );
  });

  it("marks every base preset built-in, unarchived, root and named", () => {
    for (const id of BASE_PRESET_IDS) {
      const preset = BASE_PRESETS[id];
      expect(preset.id).toBe(id);
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.extends).toBeNull();
      expect(preset.builtIn).toBe(true);
      expect(preset.archived).toBe(false);
    }
  });

  it("has complete definitions that pass the schema", () => {
    for (const id of BASE_PRESET_IDS) {
      expect(PresetDefinitionSchema.safeParse(BASE_PRESETS[id].definition).success).toBe(true);
    }
  });

  it("hw: pace, per-subtask homework with a weekly rhythm slot left open", () => {
    expect(BASE_PRESETS.hw.definition).toEqual({
      color: "blue",
      deadlinePolicy: { kind: "hard" },
      defaultEstimateMinutes: 60,
      defaultImportance: "normal",
      fields: { ...NO_FIELDS, description: true },
      notify: { ...DEFAULT_NOTIFY, criticalHours: 12 },
      progressMode: "subtasks",
      recurrence: null,
      submission: "per_subtask",
      urgencyPolicy: "pace",
    });
  });

  it("work: lag policy with a slider and ticket/description/start fields", () => {
    expect(BASE_PRESETS.work.definition).toEqual({
      color: "violet",
      deadlinePolicy: { kind: "hard" },
      defaultEstimateMinutes: 120,
      defaultImportance: "normal",
      fields: { ...NO_FIELDS, description: true, startAt: true, ticket: true },
      notify: DEFAULT_NOTIFY,
      progressMode: "slider",
      recurrence: null,
      submission: "whole",
      urgencyPolicy: "lag",
    });
  });

  it("personal: age policy with subtasks and no extra fields", () => {
    expect(BASE_PRESETS.personal.definition).toEqual({
      color: "green",
      deadlinePolicy: { kind: "hard" },
      defaultEstimateMinutes: 30,
      defaultImportance: "normal",
      fields: NO_FIELDS,
      notify: DEFAULT_NOTIFY,
      progressMode: "subtasks",
      recurrence: null,
      submission: "whole",
      urgencyPolicy: "age",
    });
  });

  it("deferred: nice-to-have with a start date and no progress", () => {
    expect(BASE_PRESETS.deferred.definition).toEqual({
      color: "slate",
      deadlinePolicy: { kind: "hard" },
      defaultEstimateMinutes: 15,
      defaultImportance: "nice_to_have",
      fields: { ...NO_FIELDS, startAt: true },
      notify: DEFAULT_NOTIFY,
      progressMode: "none",
      recurrence: null,
      submission: "whole",
      urgencyPolicy: "age",
    });
  });

  it("inbox: quick capture, nice-to-have, nothing else", () => {
    expect(BASE_PRESETS.inbox.definition).toEqual({
      color: "amber",
      deadlinePolicy: { kind: "hard" },
      defaultEstimateMinutes: 15,
      defaultImportance: "nice_to_have",
      fields: NO_FIELDS,
      notify: DEFAULT_NOTIFY,
      progressMode: "none",
      recurrence: null,
      submission: "whole",
      urgencyPolicy: "age",
    });
  });
});

describe("isBuiltInPreset", () => {
  it("recognises the base ids only", () => {
    for (const id of BASE_PRESET_IDS) {
      expect(isBuiltInPreset(id)).toBe(true);
    }
    expect(isBuiltInPreset("hw.algebra")).toBe(false);
    expect(isBuiltInPreset("")).toBe(false);
    expect(isBuiltInPreset("HW")).toBe(false);
  });
});

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Preset, PresetDefinition, ResolvedPreset } from "../model/preset.ts";

import { BASE_PRESET_IDS, BASE_PRESETS } from "./base-presets.ts";
import { INITIAL_PRESETS_STATE, type PresetsState } from "./preset-reducer.ts";
import { PresetDefinitionSchema } from "./preset-schema.ts";
import {
  presetChain,
  type PresetInput,
  resolvePreset,
  taskPreset,
  validatePresetInput,
} from "./resolve-preset.ts";

const user = (id: string, parent: null | string, definition: PresetDefinition): Preset => ({
  archived: false,
  builtIn: false,
  createdAt: "2026-10-06T10:00:00.000Z",
  definition,
  extends: parent,
  id,
  name: id,
  order: 100,
});

const stateWith = (...presets: readonly Preset[]): PresetsState => ({
  byId: {
    ...INITIAL_PRESETS_STATE.byId,
    ...Object.fromEntries(presets.map((preset) => [preset.id, preset])),
  },
});

const byText = (a: string, b: string): number => a.localeCompare(b);

const recurrence = {
  due: { time: "23:59", weekday: 3 },
  issued: { time: "10:00", weekday: 1 },
  tz: "Europe/Moscow",
} as const;

const RESOLVED_KEYS = Object.keys(BASE_PRESETS.hw.definition).toSorted(byText);

/** A resolved preset has every key, every field flag and every notify threshold. */
const isComplete = (value: ResolvedPreset): boolean =>
  PresetDefinitionSchema.safeParse(value).success &&
  Object.keys(value).toSorted(byText).join(",") === RESOLVED_KEYS.join(",") &&
  Object.keys(value.fields).length === 4 &&
  Object.keys(value.notify).length === 3;

const input = (patch: Partial<PresetInput>): PresetInput => ({
  definition: {},
  extends: "hw",
  id: "hw.new",
  name: "New",
  ...patch,
});

describe("resolvePreset", () => {
  it("resolves an edited default over its built-in values, and its children inherit the edit", () => {
    const edited = { ...BASE_PRESETS.hw, definition: { color: "pink" } } satisfies Preset;
    const state = stateWith(edited, user("hw.algebra", "hw", {}));
    expect(resolvePreset(state, "hw")).toEqual({
      ok: true,
      value: { ...BASE_PRESETS.hw.definition, color: "pink" },
    });
    expect(resolvePreset(state, "hw.algebra")).toMatchObject({
      ok: true,
      value: { color: "pink" },
    });
  });

  it("returns a built-in preset's definition as is", () => {
    for (const id of BASE_PRESET_IDS) {
      expect(resolvePreset(INITIAL_PRESETS_STATE, id)).toEqual({
        ok: true,
        value: BASE_PRESETS[id].definition,
      });
    }
  });

  it("merges root → child → grandchild, then the task overrides, later wins", () => {
    const state = stateWith(
      user("hw.math", "hw", { color: "teal", defaultEstimateMinutes: 90, recurrence }),
      user("hw.math.algebra", "hw.math", {
        deadlinePolicy: { finalAt: null, finalTz: null, kind: "resubmission", softDays: 7 },
        defaultEstimateMinutes: 45,
      }),
    );
    const result = resolvePreset(state, "hw.math.algebra", { defaultEstimateMinutes: 20 });
    expect(result).toEqual({
      ok: true,
      value: {
        ...BASE_PRESETS.hw.definition,
        color: "teal",
        deadlinePolicy: { finalAt: null, finalTz: null, kind: "resubmission", softDays: 7 },
        defaultEstimateMinutes: 20,
        recurrence,
      },
    });
  });

  it("merges fields and notify key by key across the chain", () => {
    const state = stateWith(
      user("w.a", "work", { fields: { link: false }, notify: { inProgressIdleDays: 3 } }),
      user("w.b", "w.a", { fields: { submitVia: true }, notify: { criticalHours: 48 } }),
    );
    const result = resolvePreset(state, "w.b", { notify: { criticalProgress: 0.2 } });
    expect(result).toMatchObject({
      ok: true,
      value: {
        fields: { description: true, startAt: true, submitVia: true, link: false },
        notify: {
          criticalHours: 48,
          criticalProgress: 0.2,
          inProgressIdleDays: 3,
        },
      },
    });
  });

  it("lets a child remove an inherited recurrence with null", () => {
    const state = stateWith(
      user("hw.a", "hw", { recurrence }),
      user("hw.a.once", "hw.a", { recurrence: null }),
    );
    expect(resolvePreset(state, "hw.a.once")).toMatchObject({
      ok: true,
      value: { recurrence: null },
    });
    expect(resolvePreset(state, "hw.a", { recurrence: null })).toMatchObject({
      ok: true,
      value: { recurrence: null },
    });
  });

  it("resolves an archived preset", () => {
    const state = stateWith({ ...user("hw.old", "hw", { color: "coral" }), archived: true });
    expect(resolvePreset(state, "hw.old")).toMatchObject({ ok: true, value: { color: "coral" } });
  });

  it("reports an unknown preset", () => {
    expect(resolvePreset(INITIAL_PRESETS_STATE, "ghost")).toEqual({
      error: "preset/unknown",
      ok: false,
    });
  });

  it("reports an unknown parent anywhere in the chain", () => {
    const state = stateWith(user("a", "ghost", {}), user("b", "a", {}));
    expect(resolvePreset(state, "a")).toEqual({ error: "preset/unknown-parent", ok: false });
    expect(resolvePreset(state, "b")).toEqual({ error: "preset/unknown-parent", ok: false });
  });

  it("reports a user preset without a base as an unknown parent", () => {
    const state = stateWith(user("rootless", null, {}));
    expect(resolvePreset(state, "rootless")).toEqual({
      error: "preset/unknown-parent",
      ok: false,
    });
  });

  it("reports a cycle, including self-extension", () => {
    const loop = stateWith(user("a", "b", {}), user("b", "c", {}), user("c", "a", {}));
    expect(resolvePreset(loop, "a")).toEqual({ error: "preset/cycle", ok: false });
    const self = stateWith(user("me", "me", {}));
    expect(resolvePreset(self, "me")).toEqual({ error: "preset/cycle", ok: false });
    const tail = stateWith(user("x", "y", {}), user("y", "z", {}), user("z", "y", {}));
    expect(resolvePreset(tail, "x")).toEqual({ error: "preset/cycle", ok: false });
  });

  it("rejects overrides that fail the schema", () => {
    expect(resolvePreset(INITIAL_PRESETS_STATE, "hw", { display: "card" })).toEqual({
      error: "preset/invalid-overrides",
      ok: false,
    });
    expect(resolvePreset(INITIAL_PRESETS_STATE, "hw", "nope")).toEqual({
      error: "preset/invalid-overrides",
      ok: false,
    });
  });

  it("never throws and always returns a complete preset when ok (property)", () => {
    const ids = ["a", "b", "c", "d"] as const;
    const parentArb = fc.constantFrom<null | string>(null, "ghost", ...BASE_PRESET_IDS, ...ids);
    const definitionArb: fc.Arbitrary<PresetDefinition> = fc.record(
      {
        color: fc.constantFrom("blue", "teal"),
        defaultEstimateMinutes: fc.nat({ max: 600 }),
        defaultImportance: fc.constantFrom("asap", "nice_to_have"),
        fields: fc.record({ link: fc.boolean() }, { requiredKeys: [] }),
        notify: fc.record({ criticalHours: fc.nat({ max: 72 }) }, { requiredKeys: [] }),
        recurrence: fc.constantFrom(null, recurrence),
      },
      { requiredKeys: [] },
    );
    const presetArb = (id: string): fc.Arbitrary<Preset> => {
      const parts = fc.tuple(parentArb, definitionArb, fc.boolean());
      return parts.map(([parent, definition, isArchived]) => ({
        ...user(id, parent, definition),
        archived: isArchived,
      }));
    };
    const presetsArb = fc.tuple(...ids.map((id) => presetArb(id)));
    const stateArb = presetsArb.map((presets) => stateWith(...presets));
    const targetArb = fc.constantFrom<string>("ghost", ...BASE_PRESET_IDS, ...ids);
    const overridesArb = fc.oneof(fc.constant(undefined), definitionArb, fc.anything());
    fc.assert(
      fc.property(stateArb, targetArb, overridesArb, (state, target, overrides) => {
        const result = resolvePreset(state, target, overrides);
        const isHolds = result.ok ? isComplete(result.value) : result.error.startsWith("preset/");
        expect(isHolds).toBe(true);
      }),
    );
  });
});

describe("presetChain", () => {
  it("lists the chain root → leaf", () => {
    const math = user("hw.math", "hw", {});
    const algebra = user("hw.math.algebra", "hw.math", {});
    expect(presetChain(stateWith(math, algebra), "hw.math.algebra")).toEqual({
      ok: true,
      value: [BASE_PRESETS.hw, math, algebra],
    });
  });

  it("passes the walk's errors through", () => {
    expect(presetChain(INITIAL_PRESETS_STATE, "ghost")).toEqual({
      error: "preset/unknown",
      ok: false,
    });
    const self = stateWith(user("a", "a", {}));
    expect(presetChain(self, "a")).toEqual({ error: "preset/cycle", ok: false });
  });
});

describe("validatePresetInput", () => {
  const existing = user("hw.algebra", "hw", {});
  const state = stateWith(
    existing,
    user("hw.loop", "hw.loop2", {}),
    user("hw.loop2", "hw.loop", {}),
  );

  it("accepts a well-formed creation and update", () => {
    expect(validatePresetInput(state, input({}), "create")).toEqual({ ok: true, value: undefined });
    expect(validatePresetInput(state, input({ id: "hw.algebra" }), "update")).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("rejects a bad id", () => {
    expect(validatePresetInput(state, input({ id: "HW new" }), "create")).toEqual({
      error: "preset/bad-id",
      ok: false,
    });
  });

  it("rejects creating a default id but lets a default be edited without a parent", () => {
    expect(validatePresetInput(state, input({ id: "hw" }), "create")).toEqual({
      error: "preset/built-in",
      ok: false,
    });
    expect(validatePresetInput(state, input({ extends: null, id: "hw" }), "update")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(validatePresetInput(state, input({ extends: "work", id: "hw" }), "update")).toEqual({
      error: "preset/built-in",
      ok: false,
    });
  });

  it("rejects creating an existing id and updating an unknown one", () => {
    expect(validatePresetInput(state, input({ id: "hw.algebra" }), "create")).toEqual({
      error: "preset/exists",
      ok: false,
    });
    expect(validatePresetInput(state, input({}), "update")).toEqual({
      error: "preset/unknown",
      ok: false,
    });
  });

  it("requires a base: extends null is rejected", () => {
    expect(validatePresetInput(state, input({ extends: null }), "create")).toEqual({
      error: "preset/no-base",
      ok: false,
    });
  });

  it("rejects self-extension", () => {
    expect(validatePresetInput(state, input({ extends: "hw.new" }), "create")).toEqual({
      error: "preset/self-extends",
      ok: false,
    });
  });

  it("rejects an unknown parent", () => {
    expect(validatePresetInput(state, input({ extends: "ghost" }), "create")).toEqual({
      error: "preset/unknown-parent",
      ok: false,
    });
  });

  it("rejects a parent whose chain is broken or cyclic", () => {
    expect(validatePresetInput(state, input({ extends: "hw.loop" }), "create")).toEqual({
      error: "preset/cycle",
      ok: false,
    });
    const broken = stateWith(user("hw.orphan", "ghost", {}));
    expect(validatePresetInput(broken, input({ extends: "hw.orphan" }), "create")).toEqual({
      error: "preset/unknown-parent",
      ok: false,
    });
  });

  it("rejects an update that would make the preset its own ancestor", () => {
    const withChild = stateWith(existing, user("hw.algebra.hard", "hw.algebra", {}));
    const moved = input({ extends: "hw.algebra.hard", id: "hw.algebra" });
    expect(validatePresetInput(withChild, moved, "update")).toEqual({
      error: "preset/cycle",
      ok: false,
    });
  });

  it("rejects an invalid definition", () => {
    expect(validatePresetInput(state, input({ definition: { color: "red" } }), "create")).toEqual({
      error: "preset/invalid-definition",
      ok: false,
    });
  });
});

describe("taskPreset", () => {
  const subtask = { id: "s1", label: "1", number: 1, solvedAt: null, submittedAt: null } as const;
  const task = (presetId: string, subtasks: readonly (typeof subtask)[]) =>
    ({ overrides: null, presetId, subtasks }) as const;

  it("tracks subtasks when there are some, with the preset's submission", () => {
    expect(taskPreset(INITIAL_PRESETS_STATE, task("hw", [subtask]))).toMatchObject({
      value: { progressMode: "subtasks", submission: "per_subtask" },
    });
    expect(taskPreset(INITIAL_PRESETS_STATE, task("work", [subtask]))).toMatchObject({
      value: { progressMode: "subtasks", submission: "whole" },
    });
  });

  it("falls back to the bar and a whole submission without subtasks", () => {
    expect(taskPreset(INITIAL_PRESETS_STATE, task("hw", []))).toMatchObject({
      value: { progressMode: "slider", submission: "whole" },
    });
    expect(taskPreset(INITIAL_PRESETS_STATE, task("deferred", []))).toMatchObject({
      value: { progressMode: "none" },
    });
  });
});

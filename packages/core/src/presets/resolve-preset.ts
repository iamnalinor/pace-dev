import type { Preset, PresetDefinition, ResolvedPreset } from "../model/preset.ts";
import type { Task } from "../model/task.ts";

import { err, ok, type Result } from "../result.ts";
import { BASE_PRESETS, type BasePreset, isBuiltInPreset } from "./base-presets.ts";
import { presetById, type PresetsState } from "./preset-reducer.ts";
import { PresetDefinitionSchema, PresetIdSchema } from "./preset-schema.ts";

type ChainError = "preset/cycle" | "preset/unknown" | "preset/unknown-parent";

export type PresetError = "preset/invalid-overrides" | ChainError;

export type PresetValidationError =
  | "preset/bad-id"
  | "preset/built-in"
  | "preset/exists"
  | "preset/invalid-definition"
  | "preset/no-base"
  | "preset/self-extends"
  | ChainError;

/** What the editor submits; `definition` is validated here, so it arrives as `unknown`. */
export type PresetInput = {
  readonly id: string;
  readonly name: string;
  readonly extends: null | string;
  readonly definition: unknown;
  /** Position in pickers; left as it is when absent. */
  readonly order?: number;
};

export type PresetInputMode = "create" | "update";

type Chain = { readonly base: BasePreset; readonly presets: readonly Preset[] };

/**
Follows `extends` upwards, accumulating root → leaf. A chain is valid only when it ends
at a built-in preset: that is what guarantees every value has a definition somewhere.
*/
const walk = (
  state: PresetsState,
  id: string,
  below: readonly Preset[],
): Result<Chain, ChainError> => {
  const preset = presetById(state, id);
  if (preset === undefined) {
    return err(below.length === 0 ? "preset/unknown" : "preset/unknown-parent");
  }
  if (below.some((seen) => seen.id === id)) {
    return err("preset/cycle");
  }
  const presets = [preset, ...below];
  if (preset.extends !== null) {
    return walk(state, preset.extends, presets);
  }
  return isBuiltInPreset(preset.id)
    ? ok({ base: BASE_PRESETS[preset.id], presets })
    : err("preset/unknown-parent");
};

/** A child key replaces the parent's; `fields` and `notify` merge key by key. */
const merge = (base: ResolvedPreset, delta: PresetDefinition): ResolvedPreset => ({
  defaultImportance: delta.defaultImportance ?? base.defaultImportance,
  deadlinePolicy: delta.deadlinePolicy ?? base.deadlinePolicy,
  submission: delta.submission ?? base.submission,
  progressMode: delta.progressMode ?? base.progressMode,
  // `null` is a value here (it removes the inherited schedule), so `??` would be wrong.
  recurrence: delta.recurrence === undefined ? base.recurrence : delta.recurrence,
  fields: { ...base.fields, ...delta.fields },
  notify: { ...base.notify, ...delta.notify },
  defaultEstimateMinutes: delta.defaultEstimateMinutes ?? base.defaultEstimateMinutes,
  color: delta.color ?? base.color,
});

/** Root → leaf → task overrides; chains are a few presets long, so recursion is the plain fold. */
const foldChain = (
  resolved: ResolvedPreset,
  deltas: readonly PresetDefinition[],
): ResolvedPreset => {
  const [head, ...rest] = deltas;
  return head === undefined ? resolved : foldChain(merge(resolved, head), rest);
};

const parseOverrides = (
  overrides: unknown,
): Result<PresetDefinition, "preset/invalid-overrides"> => {
  if (overrides === undefined) {
    return ok({});
  }
  const parsed = PresetDefinitionSchema.safeParse(overrides);
  return parsed.success ? ok(parsed.data) : err("preset/invalid-overrides");
};

/** The inheritance chain root → leaf, for the editor's "inherited from" placeholders. */
export const presetChain = (
  state: PresetsState,
  presetId: string,
): Result<readonly Preset[], PresetError> => {
  const chain = walk(state, presetId, []);
  return chain.ok ? ok(chain.value.presets) : chain;
};

/**
Base preset → user presets along the chain → the task's own overrides, later wins.
Archived presets resolve, so existing tasks keep working.
*/
export const resolvePreset = (
  state: PresetsState,
  presetId: string,
  overrides?: unknown,
): Result<ResolvedPreset, PresetError> => {
  const chain = walk(state, presetId, []);
  if (!chain.ok) {
    return chain;
  }
  const parsed = parseOverrides(overrides);
  if (!parsed.ok) {
    return parsed;
  }
  const deltas = [...chain.value.presets.map((preset) => preset.definition), parsed.value];
  return ok(foldChain(chain.value.base.definition, deltas));
};

/**
How a task actually tracks progress, whatever its preset prefers: with subtasks, by subtasks
(and per-subtask submission only then); without, on the 0–10 bar and submitted whole. A
preset without progress stays without.
*/
export const shapeForTask = (preset: ResolvedPreset, hasSubtasks: boolean): ResolvedPreset => {
  if (hasSubtasks) {
    return preset.progressMode === "subtasks" ? preset : { ...preset, progressMode: "subtasks" };
  }
  return {
    ...preset,
    submission: "whole",
    progressMode: preset.progressMode === "none" ? "none" : "slider",
  };
};

/** The task's preset chain with its own overrides on top, shaped by whether it has subtasks. */
export const taskPreset = (
  state: PresetsState,
  task: Pick<Task, "overrides" | "presetId" | "subtasks">,
): Result<ResolvedPreset, PresetError> => {
  const resolved = resolvePreset(state, task.presetId, task.overrides ?? undefined);
  return resolved.ok ? ok(shapeForTask(resolved.value, task.subtasks.length > 0)) : resolved;
};

const validateId = (
  state: PresetsState,
  id: string,
  mode: PresetInputMode,
): PresetValidationError | undefined => {
  if (!PresetIdSchema.safeParse(id).success) {
    return "preset/bad-id";
  }
  if (isBuiltInPreset(id)) {
    return mode === "create" ? "preset/built-in" : undefined;
  }
  const isExists = presetById(state, id) !== undefined;
  if (mode === "create" && isExists) {
    return "preset/exists";
  }
  return mode === "update" && !isExists ? "preset/unknown" : undefined;
};

const validateParent = (
  state: PresetsState,
  id: string,
  parent: null | string,
): PresetValidationError | undefined => {
  if (isBuiltInPreset(id)) {
    // A default preset is a root: it has no parent to change.
    return parent === null ? undefined : "preset/built-in";
  }
  if (parent === null) {
    return "preset/no-base";
  }
  if (parent === id) {
    return "preset/self-extends";
  }
  const chain = walk(state, parent, []);
  if (!chain.ok) {
    // The parent itself is the unknown one: from the child's point of view that is a missing parent.
    return chain.error === "preset/unknown" ? "preset/unknown-parent" : chain.error;
  }
  // On update, moving under one of its own descendants would close a loop.
  return chain.value.presets.some((preset) => preset.id === id) ? "preset/cycle" : undefined;
};

/** Everything the editor must check before emitting `preset.created` / `preset.updated`. */
export const validatePresetInput = (
  state: PresetsState,
  input: PresetInput,
  mode: PresetInputMode,
): Result<void, PresetValidationError> => {
  const problem =
    validateId(state, input.id, mode) ??
    validateParent(state, input.id, input.extends) ??
    (PresetDefinitionSchema.safeParse(input.definition).success
      ? undefined
      : "preset/invalid-definition");
  return problem === undefined ? ok(undefined) : err(problem);
};
